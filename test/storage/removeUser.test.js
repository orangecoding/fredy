/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/*
 * A real SQLite database rather than a recording double, because what is under test is what the
 * statements do: whether the foreign keys cascade, and whether the JSON rebuild of
 * `shared_with_user` produces the list without the removed id. A mock would only prove the strings
 * were sent.
 */
let db;

const sqliteMock = {
  execute: (sql, params = {}) => db.prepare(sql).run(params),
  query: (sql, params = {}) => db.prepare(sql).all(params),
  withTransaction: (callback) => db.transaction((cb) => cb(db))(callback),
};

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({ default: sqliteMock }));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({ getSettings: async () => ({ demoMode: false }) }));

const { removeUser } = await import('../../lib/services/storage/userStorage.js');

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      last_login INTEGER,
      is_admin INTEGER NOT NULL DEFAULT 0,
      mcp_token TEXT
    );
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      shared_with_user TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );
    CREATE TABLE listings (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
    );
    CREATE TABLE settings (
      id TEXT PRIMARY KEY,
      create_date INTEGER NOT NULL,
      user_id TEXT,
      name TEXT NOT NULL,
      value TEXT NOT NULL
    );
  `);

  db.exec(`
    INSERT INTO users (id, username, password) VALUES ('alice', 'alice', 'x'), ('bob', 'bob', 'x');
    INSERT INTO jobs (id, user_id, name, shared_with_user)
      VALUES ('job-alice', 'alice', 'Alice''s search', '["bob"]'),
             ('job-bob', 'bob', 'Bob''s search', '["alice","carol"]'),
             ('job-bob-2', 'bob', 'Bob''s other search', '[]');
    INSERT INTO listings (id, job_id) VALUES ('l-1', 'job-alice'), ('l-2', 'job-bob');
    INSERT INTO settings (id, create_date, user_id, name, value)
      VALUES ('s-1', 1, 'alice', 'finance_profile', '{}'),
             ('s-2', 1, 'alice', 'home_addresses', '[]'),
             ('s-3', 1, 'bob', 'theme', '"dark"'),
             ('s-4', 1, NULL, 'demoMode', 'false');
  `);
});

afterEach(() => {
  db.close();
});

/** @returns {string[]} The ids in one job's share list. */
const sharesOf = (jobId) =>
  JSON.parse(db.prepare(`SELECT shared_with_user FROM jobs WHERE id = ?`).get(jobId).shared_with_user);

describe('removeUser', () => {
  it('removes the user', () => {
    removeUser('alice');
    expect(db.prepare(`SELECT id FROM users`).all()).toEqual([{ id: 'bob' }]);
  });

  it('takes their jobs and the listings underneath with it', () => {
    removeUser('alice');
    expect(db.prepare(`SELECT id FROM jobs ORDER BY id`).all()).toEqual([{ id: 'job-bob' }, { id: 'job-bob-2' }]);
    expect(db.prepare(`SELECT id FROM listings`).all()).toEqual([{ id: 'l-2' }]);
  });

  it('takes their settings, which no foreign key covers', () => {
    removeUser('alice');
    expect(db.prepare(`SELECT id FROM settings ORDER BY id`).all()).toEqual([{ id: 's-3' }, { id: 's-4' }]);
  });

  it('leaves the settings of everybody else alone, the instance-wide ones included', () => {
    removeUser('alice');
    expect(db.prepare(`SELECT COUNT(*) AS count FROM settings WHERE user_id IS NULL`).get().count).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM settings WHERE user_id = 'bob'`).get().count).toBe(1);
  });

  it('drops them from the share list of jobs they were given access to', () => {
    removeUser('alice');
    expect(sharesOf('job-bob')).toEqual(['carol']);
  });

  it('leaves a share list holding nobody else as an empty list, not null', () => {
    removeUser('bob');
    // job-alice was shared with bob only; alice's own job must survive with an empty list.
    expect(sharesOf('job-alice')).toEqual([]);
  });

  it('does not touch the share lists of jobs the user was never on', () => {
    removeUser('alice');
    expect(sharesOf('job-bob-2')).toEqual([]);
  });

  it('is a no-op for an id nobody has', () => {
    removeUser('nobody');
    expect(db.prepare(`SELECT COUNT(*) AS count FROM users`).get().count).toBe(2);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM settings`).get().count).toBe(4);
    expect(sharesOf('job-bob')).toEqual(['alice', 'carol']);
  });
});
