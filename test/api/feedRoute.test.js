/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { up as createChannelTable } from '../../lib/services/storage/migrations/sql/32.configured-adapters.js';
import { up as createFeedTable } from '../../lib/services/storage/migrations/sql/58.notification-feed-items.js';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params = {}) => db.prepare(sql).all(params),
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    withTransaction: (cb) => db.transaction(() => cb(db))(),
  },
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ baseUrl: 'https://fredy.example' })),
}));

const feedPlugin = (await import('../../lib/api/routes/feedRouter.js')).default;
const { addFeedItems } = await import('../../lib/services/storage/notificationFeedStorage.js');

/**
 * The route as `api.js` mounts it: outside the authenticated group, so no session is set up here.
 */
async function buildApp() {
  const app = Fastify();
  await app.register(feedPlugin, { prefix: '/api/feed' });
  await app.ready();
  return app;
}

let app;

beforeEach(async () => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users (id) VALUES ('u1');`);
  db.exec(`CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT, notification_adapter TEXT);`);
  createChannelTable(db);
  createFeedTable(db);
  db.prepare(
    `INSERT INTO configured_adapter (id, user_id, adapter_id, name, fields, visibility, created_at, updated_at)
     VALUES ('c1', 'u1', 'rss', 'Berlin', '{"token":"secret-token"}', 'private', 0, 0)`,
  ).run();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  db.close();
});

describe('GET /api/feed/:token', () => {
  it('serves the channel feed as RSS without a session', async () => {
    addFeedItems('c1', [
      { kind: 'listing', title: 'Berlin flats: Bright two rooms', link: 'https://portal.example/1' },
    ]);

    const response = await app.inject({ method: 'GET', url: '/api/feed/secret-token' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/rss+xml; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toContain('<title>Fredy: Berlin</title><link>https://fredy.example</link>');
    expect(response.body).toContain('<title>Berlin flats: Bright two rooms</title>');
  });

  it('serves an empty feed before the first notification', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/feed/secret-token' });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('<item>');
  });

  it('answers an unknown token like any path that does not exist', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/feed/guessed' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Not found' });
  });
});
