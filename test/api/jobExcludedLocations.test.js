/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import Fastify from 'fastify';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params = {}) => db.prepare(sql).all(params),
    execute: (sql, params = {}) => db.prepare(sql).run(params),
  },
}));

vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: async () => ({ demoMode: false }),
}));

const plugin = (await import('../../lib/api/routes/jobRouter.js')).default;

describe('job location exclusion API', () => {
  let app;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY, user_id TEXT, enabled INTEGER DEFAULT 1, name TEXT,
        blacklist TEXT, excluded_locations TEXT NOT NULL DEFAULT '[]', provider TEXT,
        notification_adapter TEXT, shared_with_user TEXT DEFAULT '[]', spatial_filter TEXT,
        spec_filter TEXT, commute_filter TEXT, deal_type TEXT, last_run_at INTEGER
      );
      CREATE TABLE configured_adapter (
        id TEXT PRIMARY KEY, user_id TEXT, adapter_id TEXT, name TEXT, fields TEXT,
        visibility TEXT, created_at INTEGER, updated_at INTEGER
      );
      CREATE TABLE listings (job_id TEXT, is_active INTEGER, manually_deleted INTEGER);
    `);
    app = Fastify();
    app.addHook('preHandler', async (request) => {
      request.currentUser = { id: 'u1', isAdmin: false };
      request.session = { currentUser: 'u1' };
    });
    await app.register(plugin, { prefix: '/api/jobs' });
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  const post = (extra = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { name: 'Berlin', provider: [], notificationAdapter: [], ...extra },
    });

  it('saves normalized exclusions and returns them in both job list responses', async () => {
    const response = await post({ excludedLocations: [' Neukölln ', '', 'NEUKÖLLN', 'Spandau'] });
    expect(response.statusCode).toBe(200);
    expect((await app.inject('/api/jobs')).json()[0].excludedLocations).toEqual(['Neukölln', 'Spandau']);
    expect((await app.inject('/api/jobs/data')).json().result[0].excludedLocations).toEqual(['Neukölln', 'Spandau']);
  });

  it('defaults an omitted field on creation to an empty list', async () => {
    expect((await post()).statusCode).toBe(200);
    expect((await app.inject('/api/jobs')).json()[0].excludedLocations).toEqual([]);
  });

  it('preserves exclusions on an older client update and clears an explicit empty list', async () => {
    expect((await post({ excludedLocations: ['Neukölln'] })).statusCode).toBe(200);
    const { id: jobId } = (await app.inject('/api/jobs')).json()[0];
    expect((await post({ jobId, name: 'Renamed' })).statusCode).toBe(200);
    expect((await app.inject('/api/jobs')).json()[0].excludedLocations).toEqual(['Neukölln']);
    expect((await post({ jobId, excludedLocations: [] })).statusCode).toBe(200);
    expect((await app.inject('/api/jobs')).json()[0].excludedLocations).toEqual([]);
  });

  it.each([null, 'Neukölln', {}, [1], ['Neukölln', null]].map((excludedLocations) => ({ excludedLocations })))(
    'rejects a non-string-array field ($excludedLocations) without creating a job',
    async ({ excludedLocations }) => {
      const response = await post({ excludedLocations });
      expect(response.statusCode).toBe(400);
      expect(db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count).toBe(0);
    },
  );
});
