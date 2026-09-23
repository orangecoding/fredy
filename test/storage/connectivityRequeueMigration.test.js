/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/45.connectivity-requeue-unanswered.js';

/**
 * Austrian and Spanish listings stored before those countries had a coverage source were stamped
 * "looked at, nothing to say" and would not have been asked again for 180 days.
 */
describe('migration 45 - requeue unanswered connectivity lookups', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE listings (id TEXT PRIMARY KEY, connectivity JSON, connectivity_at INTEGER)`);
    const insert = db.prepare(`INSERT INTO listings (id, connectivity, connectivity_at) VALUES (?, ?, ?)`);
    insert.run('unanswered', null, 1000);
    insert.run('answered', JSON.stringify({ fixed: { maxDownMbit: 250 } }), 2000);
    insert.run('never-looked-at', null, null);
  });

  afterEach(() => db.close());

  const stampOf = (id) => db.prepare(`SELECT connectivity_at FROM listings WHERE id = ?`).get(id).connectivity_at;

  it('puts a listing stamped without an answer back in the queue', () => {
    up(db);
    expect(stampOf('unanswered')).toBeNull();
  });

  it('leaves a listing with an answer alone', () => {
    up(db);
    expect(stampOf('answered')).toBe(2000);
  });

  it('leaves the rest as it was', () => {
    up(db);
    expect(stampOf('never-looked-at')).toBeNull();
  });
});
