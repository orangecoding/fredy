/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/*
 * The job list and the dashboard asked for every job of the instance and filtered in the route, so a
 * user with one job paid for counting the listings of all of them. Against the real schema, because
 * the point is what SQLite does: which rows come back, and whether the count reads the table at all.
 */

const root = path.resolve('.');
const MIGRATIONS_DIR = path.join(root, 'lib/services/storage/migrations/sql');

let db;
let jobStorage;

/** @returns {Promise<import('better-sqlite3').Database>} The production schema, in memory. */
async function migratedDatabase() {
  const database = new Database(':memory:');
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, id: Number(file.split('.')[0]) }))
    .sort((a, b) => (a.id === b.id ? a.file.localeCompare(b.file) : a.id - b.id));
  for (const { file } of files) {
    const migration = await import(pathToFileURL(path.join(MIGRATIONS_DIR, file)).href);
    await (migration.up ?? migration.default)(database);
  }
  return database;
}

beforeEach(async () => {
  db = await migratedDatabase();
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/SqliteConnection.js', () => ({
    default: {
      getConnection: () => db,
      query: (sql, params = {}) => db.prepare(sql).all(params),
      execute: (sql, params = {}) => db.prepare(sql).run(params),
      withTransaction: (callback) => db.transaction(() => callback(db))(),
    },
  }));
  jobStorage = await import(root + '/lib/services/storage/jobStorage.js');

  db.exec(`
    INSERT INTO users (id, username, password, is_admin) VALUES ('alice', 'alice', 'x', 0), ('bob', 'bob', 'x', 0);
    INSERT INTO jobs (id, user_id, name, enabled, shared_with_user)
      VALUES ('alice-job', 'alice', 'A', 1, '[]'),
             ('bob-job', 'bob', 'B', 0, '[]'),
             ('bob-shared', 'bob', 'C', 1, '["alice"]');
  `);
});

afterEach(() => db.close());

const ids = (jobs) => jobs.map((job) => job.id);

describe('getJobs visibleTo', () => {
  it('returns only what a user owns or was given', () => {
    expect(ids(jobStorage.getJobs({ includeDisabled: true, visibleTo: { id: 'alice' } }))).toEqual([
      'alice-job',
      'bob-shared',
    ]);
  });

  it('returns everything for an admin', () => {
    expect(ids(jobStorage.getJobs({ includeDisabled: true, visibleTo: { id: 'root', isAdmin: true } }))).toEqual([
      'alice-job',
      'bob-job',
      'bob-shared',
    ]);
  });

  it('still leaves out disabled jobs unless asked for them', () => {
    expect(ids(jobStorage.getJobs({ visibleTo: { id: 'bob' } }))).toEqual(['bob-shared']);
  });

  it('is unchanged without it, for the scheduler and the crons', () => {
    expect(ids(jobStorage.getJobs())).toEqual(['alice-job', 'bob-shared']);
  });
});

describe('the per-job listing count', () => {
  it('is answered from an index without reading the rows', () => {
    const plan = db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT COUNT(1) FROM listings l WHERE l.job_id = ? AND l.is_active = 1 AND l.manually_deleted = 0`,
      )
      .all('alice-job')
      .map((row) => row.detail)
      .join('\n');
    expect(plan).toMatch(/COVERING INDEX idx_listings_job_visible/);
  });
});
