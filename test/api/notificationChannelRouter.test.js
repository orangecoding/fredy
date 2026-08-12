/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import Fastify from 'fastify';

let db;
const sent = [];

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params = {}) => db.prepare(sql).all(params),
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    withTransaction: (cb) => db.transaction(() => cb(db))(),
  },
}));

vi.mock('../../lib/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getNotificationAdapters: async () => [
      {
        config: {
          id: 'telegram',
          name: 'Telegram',
          fields: {
            token: { type: 'text', label: 'Token', secret: true },
            chatId: { type: 'text', label: 'Chat Id', target: true },
          },
        },
        send: async (payload) => sent.push(payload),
      },
      {
        config: { id: 'sqlite', name: 'SQLite', fields: { dbPath: { type: 'text', label: 'Path', target: true } } },
        send: async (payload) => sent.push(payload),
      },
    ],
  };
});

const ALICE = { id: 'u1', username: 'alice', isAdmin: false };
const BOB = { id: 'u2', username: 'bob', isAdmin: false };
const ADMIN = { id: 'a1', username: 'root', isAdmin: true };

describe('notificationChannelRouter', () => {
  let app;
  let storage;
  let currentUser;

  const build = async () => {
    const plugin = (await import('../../lib/api/routes/notificationChannelRouter.js')).default;
    const instance = Fastify();
    instance.addHook('preHandler', async (request) => {
      request.currentUser = currentUser;
      request.session = { currentUser: currentUser.id };
    });
    await instance.register(plugin, { prefix: '/api/notificationChannels' });
    return instance;
  };

  beforeEach(async () => {
    sent.length = 0;
    currentUser = ALICE;
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, notification_adapter TEXT);
      CREATE TABLE configured_adapter (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, adapter_id TEXT NOT NULL, name TEXT NOT NULL,
        fields TEXT NOT NULL DEFAULT '{}', visibility TEXT NOT NULL DEFAULT 'private',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
    `);
    storage = await import('../../lib/services/storage/configuredAdapterStorage.js');
    app = await build();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  const seed = (over = {}) =>
    storage.upsertChannel({
      userId: 'u1',
      adapterId: 'telegram',
      name: 'Family',
      fields: { token: 'tok', chatId: '123' },
      visibility: 'private',
      ...over,
    });

  const get = (url) => app.inject({ method: 'GET', url });
  const post = (url, payload) => app.inject({ method: 'POST', url, payload });
  const del = (url) => app.inject({ method: 'DELETE', url });

  describe('GET /', () => {
    it('lists the channels the caller may use, with the destination', async () => {
      seed();
      const body = (await get('/api/notificationChannels')).json();
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        adapterId: 'telegram',
        adapterName: 'Telegram',
        name: 'Family',
        destination: '123',
        visibility: 'private',
        usedByJobs: 0,
        canEdit: true,
        isOwner: true,
      });
    });

    it('never includes field values, not even for the owner', async () => {
      seed();
      expect((await get('/api/notificationChannels')).json()[0].fields).toBeUndefined();
    });

    it('hides another user private channel', async () => {
      seed();
      currentUser = BOB;
      expect((await get('/api/notificationChannels')).json()).toHaveLength(0);
    });

    it('shows an everyone channel to another user, but not as editable', async () => {
      seed({ visibility: 'everyone' });
      currentUser = BOB;
      const body = (await get('/api/notificationChannels')).json();
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ canEdit: false, isOwner: false });
    });

    it('counts the jobs using a channel', async () => {
      const id = seed();
      db.prepare(`INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES ('j1','u1','Job 1',?)`).run(
        JSON.stringify([{ configuredAdapterId: id }]),
      );
      expect((await get('/api/notificationChannels')).json()[0].usedByJobs).toBe(1);
    });
  });

  describe('GET /:id', () => {
    it('reveals secrets to the owner so the editor can prefill', async () => {
      const id = seed();
      expect((await get(`/api/notificationChannels/${id}`)).json().fields).toEqual({ token: 'tok', chatId: '123' });
    });

    it('reveals secrets to an admin', async () => {
      const id = seed();
      currentUser = ADMIN;
      expect((await get(`/api/notificationChannels/${id}`)).json().fields.token).toBe('tok');
    });

    it('blanks secrets for a non-owner who may only use the channel', async () => {
      const id = seed({ visibility: 'everyone' });
      currentUser = BOB;
      expect((await get(`/api/notificationChannels/${id}`)).json().fields).toEqual({ token: '', chatId: '123' });
    });

    it('is 403 for a channel the caller cannot even use', async () => {
      const id = seed();
      currentUser = BOB;
      expect((await get(`/api/notificationChannels/${id}`)).statusCode).toBe(403);
    });

    it('is 404 for an unknown id', async () => {
      expect((await get('/api/notificationChannels/nope')).statusCode).toBe(404);
    });
  });

  describe('POST /', () => {
    const payload = { adapterId: 'telegram', name: 'Work', fields: { token: 't', chatId: '9' } };

    it('creates a channel owned by the caller', async () => {
      const body = (await post('/api/notificationChannels', payload)).json();
      expect(storage.getChannel(body.id)).toMatchObject({ userId: 'u1', adapterId: 'telegram', name: 'Work' });
    });

    it('forces a non-admin channel to private even when everyone is requested', async () => {
      const body = (await post('/api/notificationChannels', { ...payload, visibility: 'everyone' })).json();
      expect(storage.getChannel(body.id).visibility).toBe('private');
    });

    it('lets an admin set everyone', async () => {
      currentUser = ADMIN;
      const body = (await post('/api/notificationChannels', { ...payload, visibility: 'everyone' })).json();
      expect(storage.getChannel(body.id).visibility).toBe('everyone');
    });

    it('rejects a blank name', async () => {
      expect((await post('/api/notificationChannels', { ...payload, name: '  ' })).statusCode).toBe(400);
    });

    it('rejects an unknown adapter', async () => {
      expect((await post('/api/notificationChannels', { ...payload, adapterId: 'ghost' })).statusCode).toBe(400);
    });

    it('rejects a non-admin setting the sqlite dbPath', async () => {
      const response = await post('/api/notificationChannels', {
        adapterId: 'sqlite',
        name: 'Local',
        fields: { dbPath: '/etc/whatever.db' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toMatch(/dbPath/);
    });

    it('lets a non-admin save their own sqlite channel back unchanged', async () => {
      const id = storage.upsertChannel({
        userId: 'u1',
        adapterId: 'sqlite',
        name: 'Local',
        fields: { dbPath: 'listings.db' },
      });
      const response = await post('/api/notificationChannels', {
        id,
        name: 'Local renamed',
        fields: { dbPath: 'listings.db' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('refuses to edit a channel the caller does not own', async () => {
      const id = seed({ visibility: 'everyone' });
      currentUser = BOB;
      expect((await post('/api/notificationChannels', { id, name: 'Hijacked', fields: {} })).statusCode).toBe(403);
    });

    it('keeps the adapter type when updating', async () => {
      const id = seed();
      await post('/api/notificationChannels', { id, adapterId: 'sqlite', name: 'Family', fields: {} });
      expect(storage.getChannel(id).adapterId).toBe('telegram');
    });

    it('preserves stored fields, secrets included, when the body omits the fields key', async () => {
      const id = seed();
      const response = await post('/api/notificationChannels', { id, name: 'Renamed' });
      expect(response.statusCode).toBe(200);
      const saved = storage.getChannel(id);
      expect(saved.name).toBe('Renamed');
      expect(saved.fields).toEqual({ token: 'tok', chatId: '123' });
    });

    it('replaces stored fields when the body carries the fields key', async () => {
      const id = seed();
      await post('/api/notificationChannels', {
        id,
        name: 'Family',
        fields: { token: 'rotated', chatId: '123' },
      });
      expect(storage.getChannel(id).fields).toEqual({ token: 'rotated', chatId: '123' });
    });

    it('keeps an everyone channel everyone when an admin omits visibility', async () => {
      const id = seed({ visibility: 'everyone' });
      currentUser = ADMIN;
      await post('/api/notificationChannels', {
        id,
        name: 'Family',
        fields: { token: 'tok', chatId: '123' },
      });
      expect(storage.getChannel(id).visibility).toBe('everyone');
    });

    it('lets an admin explicitly demote an everyone channel to private', async () => {
      const id = seed({ visibility: 'everyone' });
      currentUser = ADMIN;
      await post('/api/notificationChannels', {
        id,
        name: 'Family',
        fields: { token: 'tok', chatId: '123' },
        visibility: 'private',
      });
      expect(storage.getChannel(id).visibility).toBe('private');
    });

    it('keeps a non-admin channel at whatever visibility it already had when the body omits visibility', async () => {
      const id = seed({ visibility: 'everyone' });
      const response = await post('/api/notificationChannels', {
        id,
        name: 'Family',
        fields: { token: 'tok', chatId: '123' },
      });
      expect(response.statusCode).toBe(200);
      expect(storage.getChannel(id).visibility).toBe('everyone');
    });

    it('defaults a create with no fields and no visibility keys to {} and private', async () => {
      const body = (await post('/api/notificationChannels', { adapterId: 'telegram', name: 'Bare' })).json();
      const saved = storage.getChannel(body.id);
      expect(saved.fields).toEqual({});
      expect(saved.visibility).toBe('private');
    });

    it('does not clear a stored privileged field when a non-admin omits the fields key', async () => {
      const id = storage.upsertChannel({
        userId: 'u1',
        adapterId: 'sqlite',
        name: 'Local',
        fields: { dbPath: 'listings.db' },
      });
      const response = await post('/api/notificationChannels', { id, name: 'Local renamed' });
      expect(response.statusCode).toBe(200);
      expect(storage.getChannel(id).fields).toEqual({ dbPath: 'listings.db' });
    });
  });

  describe('DELETE /:id', () => {
    it('deletes an unused channel', async () => {
      const id = seed();
      expect((await del(`/api/notificationChannels/${id}`)).statusCode).toBe(200);
      expect(storage.getChannel(id)).toBeNull();
    });

    it('refuses while jobs still reference it, and names them', async () => {
      const id = seed();
      db.prepare(`INSERT INTO jobs (id, user_id, name, notification_adapter) VALUES ('j1','u1','Job 1',?)`).run(
        JSON.stringify([{ configuredAdapterId: id }]),
      );
      const response = await del(`/api/notificationChannels/${id}`);
      expect(response.statusCode).toBe(409);
      expect(response.json().jobs).toEqual([{ id: 'j1', name: 'Job 1' }]);
      expect(storage.getChannel(id)).not.toBeNull();
    });

    it('refuses for a non-owner', async () => {
      const id = seed({ visibility: 'everyone' });
      currentUser = BOB;
      expect((await del(`/api/notificationChannels/${id}`)).statusCode).toBe(403);
    });
  });

  describe('POST /:id/try', () => {
    it('fires with the stored fields, which the client never saw', async () => {
      const id = seed({ visibility: 'everyone' });
      currentUser = BOB;
      expect((await post(`/api/notificationChannels/${id}/try`, {})).statusCode).toBe(200);
      expect(sent[0].notificationConfig[0].fields).toEqual({ token: 'tok', chatId: '123' });
    });

    it('refuses for a channel the caller may not use', async () => {
      const id = seed();
      currentUser = BOB;
      expect((await post(`/api/notificationChannels/${id}/try`, {})).statusCode).toBe(403);
    });
  });
});
