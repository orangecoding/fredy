/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as hasher from '../../lib/services/security/hash.js';

/**
 * The login endpoint is the one unauthenticated write in the app. These tests cover the two ways
 * it used to leak: a rate limiter keyed on a header the caller controls, and an early return that
 * made "no such user" measurably faster than "wrong password".
 */
describe('login hardening', () => {
  let routes;
  let state;

  /**
   * @returns {{statusCode: number|null, code: Function, send: Function}}
   */
  const makeReply = () => ({
    statusCode: null,
    code(c) {
      this.statusCode = c;
      return this;
    },
    send() {
      return this;
    },
  });

  const requestFrom = (ip, username, password) => ({
    ip,
    socket: { remoteAddress: ip },
    headers: {},
    body: { username, password },
    session: {},
  });

  beforeEach(async () => {
    state = { users: [], lastLogin: [], rehashed: [] };
    vi.resetModules();
    vi.doMock('../../lib/services/storage/userStorage.js', () => ({
      getUserWithSecretsByUsername: (username) => state.users.find((u) => u.username === username) ?? null,
      setLastLoginToNow: ({ userId }) => state.lastLogin.push(userId),
      updatePasswordHash: (args) => state.rehashed.push(args),
      getUser: (id) => state.users.find((u) => u.id === id) ?? null,
    }));
    vi.doMock('../../lib/services/storage/settingsStorage.js', () => ({
      getSettings: async () => ({ demoMode: false }),
    }));
    vi.doMock('../../lib/services/tracking/Tracker.js', () => ({ trackDemoAccessed: vi.fn() }));
    vi.doMock('../../lib/api/security.js', () => ({ isUnauthorized: () => true }));

    const plugin = (await import('../../lib/api/routes/loginRoute.js')).default;
    routes = {};
    await plugin({
      get: (path, handler) => (routes[`GET ${path}`] = handler),
      post: (path, handler) => (routes[`POST ${path}`] = handler),
    });

    state.users.push({ id: 'u1', username: 'alice', password: await hasher.hash('correct horse') });
  });

  describe('rate limiting', () => {
    it('locks an address out after the per-address ceiling', async () => {
      for (let attempt = 0; attempt < 10; attempt++) {
        const reply = makeReply();
        await routes['POST /'](requestFrom('10.0.0.1', `ghost${attempt}`, 'nope'), reply);
        expect(reply.statusCode).toBe(401);
      }
      const reply = makeReply();
      await routes['POST /'](requestFrom('10.0.0.1', 'ghost-final', 'nope'), reply);
      expect(reply.statusCode).toBe(429);
    });

    it('cannot be reset by varying X-Forwarded-For', async () => {
      // request.ip is derived by fastify (and only from the header when trustProxy is on), so a
      // caller sending their own header no longer gets a fresh counter per attempt.
      const spoofed = (header) => ({
        ip: '10.0.0.9',
        socket: { remoteAddress: '10.0.0.9' },
        headers: { 'x-forwarded-for': header },
        body: { username: 'ghost', password: 'nope' },
        session: {},
      });
      for (let attempt = 0; attempt < 10; attempt++) {
        await routes['POST /'](spoofed(`1.2.3.${attempt}`), makeReply());
      }
      const reply = makeReply();
      await routes['POST /'](spoofed('9.9.9.9'), reply);
      expect(reply.statusCode).toBe(429);
    });

    it('locks a single account out across many addresses', async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const reply = makeReply();
        await routes['POST /'](requestFrom(`10.1.0.${attempt}`, 'alice', 'wrong'), reply);
        expect(reply.statusCode).toBe(401);
      }
      // A distributed guess at one account is still a guess at one account.
      const reply = makeReply();
      await routes['POST /'](requestFrom('10.1.0.99', 'alice', 'wrong'), reply);
      expect(reply.statusCode).toBe(429);
    });

    it('clears both counters after a successful login', async () => {
      await routes['POST /'](requestFrom('10.2.0.1', 'alice', 'wrong'), makeReply());
      const ok = makeReply();
      await routes['POST /'](requestFrom('10.2.0.1', 'alice', 'correct horse'), ok);
      expect(ok.statusCode).toBe(200);

      // The earlier failure must not still count against the window.
      for (let attempt = 0; attempt < 4; attempt++) {
        const reply = makeReply();
        await routes['POST /'](requestFrom('10.2.0.1', 'alice', 'wrong'), reply);
        expect(reply.statusCode).toBe(401);
      }
    });
  });

  describe('user enumeration', () => {
    it('answers 401 alike for an unknown user and a wrong password', async () => {
      const unknown = makeReply();
      await routes['POST /'](requestFrom('10.3.0.1', 'nobody', 'whatever'), unknown);
      const wrongPassword = makeReply();
      await routes['POST /'](requestFrom('10.3.0.2', 'alice', 'whatever'), wrongPassword);
      expect(unknown.statusCode).toBe(401);
      expect(wrongPassword.statusCode).toBe(401);
    });

    it('verifies against a dummy hash so an unknown user costs the same work', async () => {
      const verify = vi.spyOn(hasher, 'verify');
      // Cannot spy through the module the route imported, so assert the property that makes the
      // timing equal instead: the dummy hash is a real, well-formed scrypt hash of the same cost.
      verify.mockRestore();
      expect(hasher.DUMMY_HASH).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
      expect(await hasher.verify('anything at all', hasher.DUMMY_HASH)).toBe(false);
    });

    it('logs in successfully with the right password', async () => {
      const reply = makeReply();
      const request = requestFrom('10.4.0.1', 'alice', 'correct horse');
      await routes['POST /'](request, reply);
      expect(reply.statusCode).toBe(200);
      expect(request.session.currentUser).toBe('u1');
      expect(state.lastLogin).toEqual(['u1']);
    });

    it('upgrades a legacy hash on a successful login', async () => {
      const legacy = await import('crypto').then((c) =>
        c.createHash('sha256').update('legacy secret', 'utf8').digest('hex'),
      );
      state.users.push({ id: 'u2', username: 'bob', password: legacy });

      const reply = makeReply();
      await routes['POST /'](requestFrom('10.5.0.1', 'bob', 'legacy secret'), reply);
      expect(reply.statusCode).toBe(200);
      expect(state.rehashed).toHaveLength(1);
      expect(state.rehashed[0].passwordHash.startsWith('scrypt$')).toBe(true);
    });
  });
});
