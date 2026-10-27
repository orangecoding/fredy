/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/52.listing-added-manually.js';

/**
 * Every listing stored before this migration was found by a job, so every one of them has to come
 * out of it explicitly *not* marked. A NULL would read as "unknown" to anything that later asks.
 */
describe('migration 52 - listing added manually', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE listings (id TEXT PRIMARY KEY, job_id TEXT)`);
  });

  afterEach(() => db.close());

  const flagOf = (id) => db.prepare(`SELECT added_manually FROM listings WHERE id = ?`).get(id).added_manually;

  it('backfills existing listings with 0 rather than NULL', () => {
    db.prepare(`INSERT INTO listings (id) VALUES (?)`).run('listing-1');
    up(db);

    expect(flagOf('listing-1')).toBe(0);
  });

  it('defaults new listings to 0', () => {
    up(db);
    db.prepare(`INSERT INTO listings (id) VALUES (?)`).run('listing-2');

    expect(flagOf('listing-2')).toBe(0);
  });

  it('is a no-op when run again', () => {
    up(db);
    db.prepare(`INSERT INTO listings (id, added_manually) VALUES (?, 1)`).run('listing-3');

    expect(() => up(db)).not.toThrow();
    expect(flagOf('listing-3')).toBe(1);
  });
});
