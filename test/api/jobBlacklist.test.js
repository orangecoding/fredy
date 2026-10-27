/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import Fastify from 'fastify';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params = {}) => db.prepare(sql).all(params),
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    withTransaction: (cb) => db.transaction(() => cb(db))(),
  },
}));

vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: async () => ({ demoMode: false }),
  upsertSettings: () => {},
}));

const ALICE = { id: 'u1', username: 'alice', isAdmin: false };
const BOB = { id: 'u2', username: 'bob', isAdmin: false };
const ADMIN = { id: 'a1', username: 'root', isAdmin: true };

describe('POST /api/jobs/:jobId/blacklist', () => {
  let app;
  let currentUser;

  const build = async () => {
    const plugin = (await import('../../lib/api/routes/jobRouter.js')).default;
    const instance = Fastify();
    instance.addHook('preHandler', async (request) => {
      request.currentUser = currentUser;
      request.session = { currentUser: currentUser?.id };
    });
    await instance.register(plugin, { prefix: '/api/jobs' });
    return instance;
  };

  beforeEach(async () => {
    currentUser = ALICE;
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        enabled INTEGER DEFAULT 1,
        name TEXT,
        blacklist TEXT,
        provider TEXT,
        notification_adapter TEXT,
        shared_with_user TEXT,
        spatial_filter TEXT,
        spec_filter TEXT,
        commute_filter TEXT,
        deal_type TEXT,
        last_run_at INTEGER
      );
      CREATE TABLE configured_adapter (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT,
        adapter_id TEXT,
        visibility TEXT,
        fields TEXT
      );
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        is_active INTEGER DEFAULT 1,
        manually_deleted INTEGER DEFAULT 0
      );
    `);

    db.prepare(
      `
      INSERT INTO jobs (id, user_id, enabled, name, blacklist, provider, notification_adapter, shared_with_user, deal_type)
      VALUES (?, ?, 1, ?, ?, '[]', '[]', '[]', 'rent')
    `,
    ).run('job-alice', 'u1', 'Alice Job', JSON.stringify(['OldWord']));

    app = await build();
  });

  it('rejects empty or whitespace-only word input with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-alice/blacklist',
      payload: { word: '   ' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toBe('No valid blacklist word provided');
  });

  it('returns 404 if job does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/nonexistent-job/blacklist',
      payload: { word: 'Tauschwohnung' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 if another user tries to modify the job', async () => {
    currentUser = BOB;
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-alice/blacklist',
      payload: { word: 'Tauschwohnung' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('successfully appends word and trims whitespace', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-alice/blacklist',
      payload: { word: '  Tauschwohnung  ' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.added).toEqual(['Tauschwohnung']);
    expect(body.blacklist).toEqual(['OldWord', 'Tauschwohnung']);

    const row = db.prepare('SELECT blacklist FROM jobs WHERE id = ?').get('job-alice');
    expect(JSON.parse(row.blacklist)).toEqual(['OldWord', 'Tauschwohnung']);
  });

  it('deduplicates case-insensitively when word already exists', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-alice/blacklist',
      payload: { word: 'oldword' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.added).toEqual([]);
    expect(body.blacklist).toEqual(['OldWord']);
  });

  it('supports words array in body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-alice/blacklist',
      payload: { words: ['WBS', 'Zwangsversteigerung', 'oldword'] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.added).toEqual(['WBS', 'Zwangsversteigerung']);
    expect(body.blacklist).toEqual(['OldWord', 'WBS', 'Zwangsversteigerung']);
  });

  it('allows admin to modify any job', async () => {
    currentUser = ADMIN;
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-alice/blacklist',
      payload: { word: 'AdminAdded' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.added).toEqual(['AdminAdded']);
  });
});
