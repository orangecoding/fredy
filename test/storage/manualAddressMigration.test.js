/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/30.manual-listing-address.js';

/**
 * The flag is what protects a hand-corrected address from the automated writers, so an existing
 * install must come out of the migration with every row explicitly *not* flagged - a NULL there
 * would make `address_is_manual = 0` filter out exactly the listings that need geocoding.
 */
describe('migration 30 - manual listing address', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        address TEXT,
        latitude REAL,
        longitude REAL
      );
    `);
  });

  afterEach(() => db.close());

  const columns = () =>
    db
      .prepare(`PRAGMA table_info(listings)`)
      .all()
      .map((column) => column.name);

  const addListing = (id, address) => db.prepare(`INSERT INTO listings (id, address) VALUES (?,?)`).run(id, address);

  it('adds the flag column', () => {
    up(db);
    expect(columns()).toContain('address_is_manual');
  });

  it('backfills existing listings with 0 rather than NULL', () => {
    addListing('listing-1', 'Mindener Straße 90, 40227 Düsseldorf');
    up(db);

    const row = db.prepare(`SELECT address_is_manual FROM listings WHERE id = ?`).get('listing-1');
    expect(row.address_is_manual).toBe(0);
  });

  it('defaults new listings to 0', () => {
    up(db);
    addListing('listing-2', 'Wehrhahn 1, 40211 Düsseldorf');

    const row = db.prepare(`SELECT address_is_manual FROM listings WHERE id = ?`).get('listing-2');
    expect(row.address_is_manual).toBe(0);
  });

  it('is a no-op when run again', () => {
    up(db);
    addListing('listing-3', 'Bilker Allee 5, 40219 Düsseldorf');
    db.prepare(`UPDATE listings SET address_is_manual = 1 WHERE id = ?`).run('listing-3');

    expect(() => up(db)).not.toThrow();

    const row = db.prepare(`SELECT address_is_manual FROM listings WHERE id = ?`).get('listing-3');
    expect(row.address_is_manual).toBe(1);
  });
});
