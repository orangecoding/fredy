/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/39.manual-listing-activity.js';

/**
 * `getListingsDueForActiveCheck` filters on `activity_is_manual = 0`, so an existing install has to
 * come out of the migration with every row explicitly *not* flagged. A NULL there would silently
 * exclude every pre-existing listing from the alive-checker, which is the opposite of the intent.
 */
describe('migration 39 - manual listing activity', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        is_active INTEGER,
        inactive_since INTEGER
      );
    `);
  });

  afterEach(() => db.close());

  const columns = () =>
    db
      .prepare(`PRAGMA table_info(listings)`)
      .all()
      .map((column) => column.name);

  const addListing = (id, isActive = 1) =>
    db.prepare(`INSERT INTO listings (id, is_active) VALUES (?,?)`).run(id, isActive);

  it('adds the flag column', () => {
    up(db);
    expect(columns()).toContain('activity_is_manual');
  });

  it('backfills existing listings with 0 rather than NULL', () => {
    addListing('listing-1');
    up(db);

    expect(db.prepare(`SELECT activity_is_manual FROM listings WHERE id = ?`).get('listing-1').activity_is_manual).toBe(
      0,
    );
  });

  it('defaults new listings to 0', () => {
    up(db);
    addListing('listing-2');

    expect(db.prepare(`SELECT activity_is_manual FROM listings WHERE id = ?`).get('listing-2').activity_is_manual).toBe(
      0,
    );
  });

  it('is a no-op when run again', () => {
    up(db);
    addListing('listing-3', 0);
    db.prepare(`UPDATE listings SET activity_is_manual = 1 WHERE id = ?`).run('listing-3');

    expect(() => up(db)).not.toThrow();

    expect(db.prepare(`SELECT activity_is_manual FROM listings WHERE id = ?`).get('listing-3').activity_is_manual).toBe(
      1,
    );
  });
});
