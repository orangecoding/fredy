/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up as createSessions } from '../../lib/services/storage/migrations/sql/26.sessions.js';
import { up } from '../../lib/services/storage/migrations/sql/50.session-user-id.js';

/**
 * The sessions already open when this migration runs belong to somebody too, and a password change
 * right after the upgrade has to end them as well.
 */
describe('migration 50 - user id on sessions', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    createSessions(db);
    const insert = db.prepare(`INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, 1)`);
    insert.run('signed-in', JSON.stringify({ currentUser: 'user-1', createdAt: 1 }));
    insert.run('anonymous', JSON.stringify({ cookie: {} }));
    insert.run('broken', 'not json');
    up(db);
  });

  afterEach(() => db.close());

  const userOf = (sid) => db.prepare(`SELECT user_id FROM sessions WHERE sid = ?`).get(sid).user_id;

  it('fills the user from the stored session', () => {
    expect(userOf('signed-in')).toBe('user-1');
  });

  it('leaves a session nobody signed in with empty', () => {
    expect(userOf('anonymous')).toBeNull();
  });

  it('does not fail on a row that is not JSON', () => {
    expect(userOf('broken')).toBeNull();
  });
});
