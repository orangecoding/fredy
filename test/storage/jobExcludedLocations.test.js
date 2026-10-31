/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params = {}) => db.prepare(sql).all(params),
    execute: (sql, params = {}) => db.prepare(sql).run(params),
  },
}));

const storage = await import('../../lib/services/storage/jobStorage.js');

describe('job location exclusion persistence', () => {
  beforeEach(() => {
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
  });

  afterEach(() => db.close());

  const save = (jobId, extra = {}) =>
    storage.upsertJob({ jobId, userId: 'u1', name: jobId, provider: [], notificationAdapter: [], ...extra });

  it('defaults new jobs and pre-existing jobs without exclusions to an empty list on every read path', () => {
    db.prepare(`INSERT INTO jobs (id, user_id, name) VALUES ('old', 'u1', 'Old job')`).run();
    save('new');

    expect(storage.getJob('old').excludedLocations).toEqual([]);
    expect(storage.getJob('new').excludedLocations).toEqual([]);
    expect(storage.getJobs().map((job) => job.excludedLocations)).toEqual([[], []]);
    expect(storage.queryJobs({ userId: 'u1' }).result.map((job) => job.excludedLocations)).toEqual([[], []]);
  });

  it('round-trips trimmed case-insensitively deduplicated locations on every read path', () => {
    save('j1', { excludedLocations: [' Neukölln ', '', '  ', 'NEUKÖLLN', 'Spandau'] });

    expect(
      JSON.parse(db.prepare(`SELECT excluded_locations FROM jobs WHERE id = 'j1'`).get().excluded_locations),
    ).toEqual(['Neukölln', 'Spandau']);
    expect(storage.getJob('j1').excludedLocations).toEqual(['Neukölln', 'Spandau']);
    expect(storage.getJobs()[0].excludedLocations).toEqual(['Neukölln', 'Spandau']);
    expect(storage.queryJobs({ userId: 'u1' }).result[0].excludedLocations).toEqual(['Neukölln', 'Spandau']);
  });

  it('keeps exclusions independent between jobs when a job is edited or cloned', () => {
    save('a', { excludedLocations: ['Neukölln', 'Spandau'] });
    save('b', { excludedLocations: ['Marzahn'] });
    const original = storage.getJob('a');
    storage.upsertJob({ ...original, jobId: 'clone' });
    save('clone', { excludedLocations: ['Mitte'] });

    expect(storage.getJob('a').excludedLocations).toEqual(['Neukölln', 'Spandau']);
    expect(storage.getJob('b').excludedLocations).toEqual(['Marzahn']);
    expect(storage.getJob('clone').excludedLocations).toEqual(['Mitte']);
  });

  it('preserves exclusions for an older client update that omits the field, and lets an explicit empty list clear it', () => {
    save('a', { excludedLocations: ['Neukölln'] });
    save('a', { name: 'Renamed' });
    expect(storage.getJob('a').excludedLocations).toEqual(['Neukölln']);

    save('a', { excludedLocations: [] });
    expect(storage.getJob('a').excludedLocations).toEqual([]);
  });

  it.each(['not JSON', 'null', '{}'])('tolerates a malformed stored exclusion list (%s)', (raw) => {
    save('a');
    db.prepare(`UPDATE jobs SET excluded_locations = ? WHERE id = 'a'`).run(raw);
    expect(storage.getJob('a').excludedLocations).toEqual([]);
    expect(storage.getJobs()[0].excludedLocations).toEqual([]);
    expect(storage.queryJobs({ userId: 'u1' }).result[0].excludedLocations).toEqual([]);
  });

  it('migrates existing jobs without changing saved criteria and can be rerun safely', async () => {
    db.exec(`
      ALTER TABLE jobs DROP COLUMN excluded_locations;
      INSERT INTO jobs (id, user_id, name, blacklist, provider, spatial_filter)
      VALUES ('old', 'u1', 'My search', '["ground floor"]', '[{"id":"immoscout"}]', '{"type":"FeatureCollection","features":[]}');
    `);
    const before = db.prepare(`SELECT * FROM jobs WHERE id = 'old'`).get();
    const { up } = await import('../../lib/services/storage/migrations/sql/52.job-excluded-locations.js');

    up(db);
    up(db);

    expect(db.prepare(`SELECT * FROM jobs WHERE id = 'old'`).get()).toEqual({ ...before, excluded_locations: '[]' });
    expect(storage.getJob('old').excludedLocations).toEqual([]);
  });
});
