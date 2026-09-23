/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The storage half of the edit-user flow, against a real database.
 *
 * The route test replaces `userStorage` with a stub, so the one behaviour the relaxed password rule
 * rests on - an edit with an empty password keeps the stored hash - was only ever asserted by
 * matching a comment in the source, which cannot fail.
 */
describe('userStorage.upsertUser', () => {
  let db;
  let userStorage;
  let hasher;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        last_login INTEGER,
        is_admin INTEGER NOT NULL DEFAULT 0,
        mcp_token TEXT
      );
      CREATE UNIQUE INDEX idx_users_username ON users (username);
    `);

    vi.resetModules();
    vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        query: (sql, params) => db.prepare(sql).all(params ?? {}),
        execute: (sql, params) => db.prepare(sql).run(params ?? {}),
        withTransaction: (fn) => db.transaction(() => fn(db))(),
      },
    }));
    userStorage = await import('../../lib/services/storage/userStorage.js');
    hasher = await import('../../lib/services/security/hash.js');
  });

  afterEach(() => db.close());

  const row = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const idOf = (username) => db.prepare('SELECT id FROM users WHERE username = ?').get(username).id;

  it('keeps the stored password when an edit leaves it empty', async () => {
    await userStorage.upsertUser({ username: 'kim', password: 'secret', isAdmin: false });
    const id = idOf('kim');
    const before = row(id).password;

    await userStorage.upsertUser({ userId: id, username: 'kim-renamed', password: '', isAdmin: true });

    const after = row(id);
    expect(after.password).toBe(before);
    expect(after.username).toBe('kim-renamed');
    expect(after.is_admin).toBe(1);
    expect(await hasher.verify('secret', after.password)).toBe(true);
  });

  it('replaces the stored password when an edit gives a new one', async () => {
    await userStorage.upsertUser({ username: 'kim', password: 'secret', isAdmin: false });
    const id = idOf('kim');

    await userStorage.upsertUser({ userId: id, username: 'kim', password: 'another', isAdmin: false });

    expect(await hasher.verify('another', row(id).password)).toBe(true);
    expect(await hasher.verify('secret', row(id).password)).toBe(false);
  });
});
