/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

let db;
let demoMode = true;

vi.mock('../../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    query: (sql, params = {}) => db.prepare(sql).all(params),
    withTransaction: (callback) => db.transaction((cb) => cb(db))(callback),
  },
}));
vi.mock('../../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: async () => ({ demoMode }),
  getUserSettings: () => ({}),
  upsertSettings: () => {},
}));

const demoRow = () => db.prepare(`SELECT is_admin AS isAdmin FROM users WHERE username = 'demo'`).get();

describe('userStorage.ensureDemoUserExists', () => {
  let ensureDemoUserExists;

  beforeEach(async () => {
    demoMode = true;
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (
        id         TEXT PRIMARY KEY,
        username   TEXT UNIQUE,
        password   TEXT,
        last_login INTEGER,
        is_admin   INTEGER DEFAULT 0,
        mcp_token  TEXT
      );
      CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT);
    `);
    ({ ensureDemoUserExists } = await import('../../../lib/services/storage/userStorage.js'));
  });

  afterEach(() => db.close());

  it('creates the demo user without admin rights', async () => {
    await ensureDemoUserExists();

    expect(demoRow().isAdmin).toBe(0);
  });

  it('demotes an existing demo user that still has admin rights', async () => {
    db.prepare(`INSERT INTO users (id, username, password, is_admin) VALUES ('u1', 'demo', 'x', 1)`).run();

    await ensureDemoUserExists();

    expect(demoRow().isAdmin).toBe(0);
    expect(db.prepare(`SELECT COUNT(1) AS n FROM users WHERE username = 'demo'`).get().n).toBe(1);
  });
});
