/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up, DEFAULT_LISTING_RETENTION_DAYS } from '../../lib/services/storage/migrations/sql/27.listing-retention.js';

/**
 * The migration decides what happens to the backlog of already-offline listings on the first start
 * after an upgrade. Stamping them with anything older than "now" would hand the purge a pile of rows
 * to delete before the operator has even seen the new setting, so that is what the backfill test
 * guards.
 */
describe('migration 27 - listing retention', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        is_active INTEGER,
        created_at INTEGER,
        last_checked_at INTEGER
      );
      CREATE TABLE settings (
        id TEXT PRIMARY KEY,
        create_date INTEGER,
        name TEXT,
        value TEXT,
        user_id TEXT
      );
    `);
  });

  afterEach(() => db.close());

  const addListing = (id, isActive, createdAt = 1_600_000_000_000) =>
    db
      .prepare(`INSERT INTO listings (id, is_active, created_at, last_checked_at) VALUES (?,?,?,?)`)
      .run(id, isActive, createdAt, createdAt);
  const rowOf = (id) => db.prepare(`SELECT * FROM listings WHERE id = ?`).get(id);
  const settingValue = (name) => db.prepare(`SELECT value FROM settings WHERE name = ?`).get(name)?.value;
  const columns = () =>
    db
      .prepare(`PRAGMA table_info(listings)`)
      .all()
      .map((column) => column.name);

  it('adds both columns and the index', () => {
    up(db);
    expect(columns()).toContain('inactive_since');
    expect(columns()).toContain('active_check_failures');
    const indexes = db
      .prepare(`PRAGMA index_list(listings)`)
      .all()
      .map((index) => index.name);
    expect(indexes).toContain('idx_listings_inactive_since');
  });

  it('stamps the existing backlog with the migration time, not with when the listing was found', () => {
    const before = Date.now();
    addListing('long-offline', 0);
    up(db);
    // Anything older would put most of the backlog past the grace period immediately, so the first
    // run after an upgrade would delete rows nobody was warned about.
    expect(rowOf('long-offline').inactive_since).toBeGreaterThanOrEqual(before);
  });

  it('leaves active listings and undetermined ones without a timestamp', () => {
    addListing('alive', 1);
    addListing('unknown', null);
    up(db);
    expect(rowOf('alive').inactive_since).toBeNull();
    expect(rowOf('unknown').inactive_since).toBeNull();
  });

  it('starts every listing on a clean failure counter', () => {
    addListing('alive', 1);
    up(db);
    expect(rowOf('alive').active_check_failures).toBe(0);
  });

  it('seeds the retention setting with the default', () => {
    up(db);
    expect(settingValue('listingRetentionDays')).toBe(JSON.stringify(DEFAULT_LISTING_RETENTION_DAYS));
  });

  it('never overwrites a value the operator already set', () => {
    db.prepare(
      `INSERT INTO settings (id, create_date, name, value, user_id) VALUES ('x', 1, 'listingRetentionDays', '3', NULL)`,
    ).run();
    up(db);
    expect(settingValue('listingRetentionDays')).toBe('3');
  });

  it('is safe to run again', () => {
    addListing('offline', 0);
    up(db);
    const stamped = rowOf('offline').inactive_since;
    expect(() => up(db)).not.toThrow();
    expect(rowOf('offline').inactive_since).toBe(stamped);
    expect(db.prepare(`SELECT COUNT(1) AS c FROM settings WHERE name = 'listingRetentionDays'`).get().c).toBe(1);
  });
});
