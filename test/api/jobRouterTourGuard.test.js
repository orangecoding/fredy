/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  getUserSettings: () => ({}),
  upsertSettings: () => {},
}));

const ALICE = { id: 'u1', username: 'alice', isAdmin: false };

/**
 * The onboarding tour's example job lives under a reserved id prefix, never searches and is deleted
 * without asking. Both guards here keep that contract from leaking in either direction: nobody can
 * create a real job that would be mistaken for a tour job, and the tour job cannot be started by hand.
 */
describe('job routes and the onboarding tour', () => {
  let app;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY, user_id TEXT, enabled INTEGER DEFAULT 1, name TEXT, blacklist TEXT, provider TEXT,
        notification_adapter TEXT, shared_with_user TEXT DEFAULT '[]', spatial_filter TEXT, spec_filter TEXT,
        commute_filter TEXT, deal_type TEXT, last_run_at INTEGER
      );
      CREATE TABLE configured_adapter (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, adapter_id TEXT NOT NULL, name TEXT NOT NULL,
        fields TEXT NOT NULL DEFAULT '{}', visibility TEXT NOT NULL DEFAULT 'private',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE listings (job_id TEXT, is_active INTEGER, manually_deleted INTEGER);
    `);
    const plugin = (await import('../../lib/api/routes/jobRouter.js')).default;
    app = Fastify();
    app.addHook('preHandler', async (request) => {
      request.currentUser = ALICE;
      request.session = { currentUser: ALICE.id };
    });
    await app.register(plugin, { prefix: '/api/jobs' });
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('refuses to create a job under the reserved tour id prefix', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { jobId: 'tour-u1', name: 'Sneaky', provider: [], notificationAdapter: [], dealType: 'rent' },
    });
    expect(response.statusCode).toBe(400);
    expect(db.prepare(`SELECT COUNT(1) AS c FROM jobs`).get().c).toBe(0);
  });

  it('refuses a manual run of the example job', async () => {
    db.prepare(
      `INSERT INTO jobs (id, user_id, enabled, name, provider, notification_adapter) VALUES ('tour-u1', 'u1', 0, 'Tour', '[]', '[]')`,
    ).run();
    const response = await app.inject({ method: 'POST', url: '/api/jobs/tour-u1/run' });
    expect(response.statusCode).toBe(409);
  });
});
