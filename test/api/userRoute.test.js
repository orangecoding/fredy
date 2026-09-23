/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const root = (await import('node:path')).resolve('.');

/** Every user the storage double knows about. */
let storedUsers;
/** Every argument `upsertUser` was called with, in order. */
let upserts;

/**
 * Register the user plugin against a fastify double and hand back its handlers.
 *
 * @returns {Promise<Record<string, (request: any, reply: any) => any>>} Keyed `METHOD path`.
 */
async function loadHandlers() {
  storedUsers = [
    { id: 'admin-1', username: 'admin', isAdmin: true },
    { id: 'kim-1', username: 'kim', isAdmin: false },
  ];
  upserts = [];

  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/userStorage.js', () => ({
    getUsers: () => storedUsers,
    getUser: (userId) => storedUsers.find((user) => user.id === userId) ?? null,
    getUserByUsername: (username) => storedUsers.find((user) => user.username === username) ?? null,
    getMcpToken: () => null,
    removeUser: vi.fn(),
    upsertUser: async (payload) => upserts.push(payload),
  }));
  vi.doMock(root + '/lib/services/storage/jobStorage.js', () => ({
    removeJobsByUserId: vi.fn(),
  }));

  const plugin = (await import(root + '/lib/api/routes/userRoute.js')).default;
  /** @type {Record<string, (request: any, reply: any) => any>} */
  const routes = {};
  await plugin({
    get: (path, handler) => (routes[`GET ${path}`] = handler),
    post: (path, handler) => (routes[`POST ${path}`] = handler),
    delete: (path, handler) => (routes[`DELETE ${path}`] = handler),
  });
  return routes;
}

/** A reply double that records what the handler answered. */
function replyDouble() {
  const recorded = { status: 200, payload: undefined };
  return {
    recorded,
    code(status) {
      recorded.status = status;
      return this;
    },
    send(payload) {
      recorded.payload = payload;
      return recorded;
    },
  };
}

describe('POST /api/admin/users', () => {
  /** @type {(request: any, reply: any) => any} */
  let post;

  beforeEach(async () => {
    post = (await loadHandlers())['POST /'];
  });

  /**
   * Post a user body and report what came back.
   *
   * @param {Record<string, any>} body
   * @returns {Promise<{status: number, payload: any}>}
   */
  async function save(body) {
    const reply = replyDouble();
    await post({ body, session: { currentUser: 'admin-1' } }, reply);
    return reply.recorded;
  }

  it('lets an edit through without a password, and leaves the stored one alone', async () => {
    // The whole point of this route change: changing a role must not require handing the person a
    // new password. An empty password reaches `upsertUser`, whose update branch then keeps the
    // hash that is already stored.
    const { status } = await save({ userId: 'kim-1', username: 'kim', password: '', password2: '', isAdmin: true });

    expect(status).toBe(200);
    expect(upserts).toEqual([{ userId: 'kim-1', username: 'kim', password: '', isAdmin: true }]);
  });

  it('lets an edit rename somebody without a password', async () => {
    const { status } = await save({ userId: 'kim-1', username: 'kim-2', password: '', password2: '', isAdmin: false });

    expect(status).toBe(200);
    expect(upserts[0].username).toBe('kim-2');
  });

  it('still takes a new password on an edit and passes it on', async () => {
    const { status } = await save({
      userId: 'kim-1',
      username: 'kim',
      password: 'new one',
      password2: 'new one',
      isAdmin: false,
    });

    expect(status).toBe(200);
    expect(upserts[0].password).toBe('new one');
  });

  it('still refuses a new user without a password', async () => {
    const { status, payload } = await save({ userId: null, username: 'nina', password: '', password2: '' });

    expect(status).toBe(400);
    expect(payload).toEqual({ error: 'A password is mandatory for a new user.' });
    expect(upserts).toEqual([]);
  });

  it('still refuses two passwords that differ, on create and on edit alike', async () => {
    for (const userId of [null, 'kim-1']) {
      upserts = [];
      const { status, payload } = await save({ userId, username: 'kim', password: 'a', password2: 'b' });

      expect(status, String(userId)).toBe(400);
      expect(payload).toEqual({ error: 'Passwords do not match.' });
      expect(upserts).toEqual([]);
    }
  });

  it('refuses a save without a username', async () => {
    const { status, payload } = await save({ userId: 'kim-1', username: '', password: '', password2: '' });

    expect(status).toBe(400);
    expect(payload).toEqual({ error: 'A username is mandatory.' });
    expect(upserts).toEqual([]);
  });

  it('still refuses to demote the last admin', async () => {
    const { status, payload } = await save({
      userId: 'admin-1',
      username: 'admin',
      password: '',
      password2: '',
      isAdmin: false,
    });

    expect(status).toBe(400);
    expect(payload.error).toMatch(/no other user in the system/);
    expect(upserts).toEqual([]);
  });

  it('takes a create with both passwords filled in, as it always did', async () => {
    const { status } = await save({
      userId: null,
      username: 'nina',
      password: 'correct horse',
      password2: 'correct horse',
      isAdmin: true,
    });

    expect(status).toBe(200);
    expect(upserts).toEqual([{ userId: null, username: 'nina', password: 'correct horse', isAdmin: true }]);
  });

  it('refuses an edit of a user that does not exist instead of creating one without a password', async () => {
    // `upsertUser` inserts for an unknown id, so an edit of an account deleted in the meantime used
    // to create a new one whose password was the empty string.
    const { status, payload } = await save({
      userId: 'deleted-meanwhile',
      username: 'ghost',
      password: '',
      password2: '',
      isAdmin: true,
    });

    expect(status).toBe(404);
    expect(payload).toEqual({ error: 'User not found.' });
    expect(upserts).toEqual([]);
  });

  it('refuses a name another account already has, on create and on rename', async () => {
    for (const body of [
      { userId: null, username: 'kim', password: 'pw', password2: 'pw', isAdmin: false },
      { userId: 'admin-1', username: 'kim', password: '', password2: '', isAdmin: true },
    ]) {
      upserts = [];
      const { status, payload } = await save(body);

      expect(status, String(body.userId)).toBe(409);
      expect(payload).toEqual({ error: 'A user with this name already exists.' });
      expect(upserts).toEqual([]);
    }
  });

  it('lets a user keep their own name on an edit', async () => {
    const { status } = await save({ userId: 'kim-1', username: 'kim', password: '', password2: '', isAdmin: false });

    expect(status).toBe(200);
  });

  it('stores the name trimmed, the way the login form sends it', async () => {
    const { status } = await save({
      userId: null,
      username: '  nina ',
      password: 'pw',
      password2: 'pw',
      isAdmin: false,
    });

    expect(status).toBe(200);
    expect(upserts[0].username).toBe('nina');
  });

  it('refuses a name made of spaces only', async () => {
    const { status, payload } = await save({ userId: 'kim-1', username: '   ', password: '', password2: '' });

    expect(status).toBe(400);
    expect(payload).toEqual({ error: 'A username is mandatory.' });
  });
});

describe('GET /api/admin/users/:userId', () => {
  it('answers 404 for an unknown id rather than 200 with null', async () => {
    const get = (await loadHandlers())['GET /:userId'];
    const reply = replyDouble();
    await get({ params: { userId: 'nobody' } }, reply);

    expect(reply.recorded.status).toBe(404);
    expect(reply.recorded.payload).toEqual({ error: 'User not found.' });
  });

  it('still returns a known user', async () => {
    const get = (await loadHandlers())['GET /:userId'];
    const user = await get({ params: { userId: 'kim-1' } }, replyDouble());

    expect(user).toEqual({ id: 'kim-1', username: 'kim', isAdmin: false });
  });
});
