/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import {
  up,
  DEFAULT_PRICE_CHECK_INTERVAL_DAYS,
  DEFAULT_PRICE_CHECK_LIMIT_PER_RUN,
} from '../../lib/services/storage/migrations/sql/28.price-history.js';

/**
 * The migration seeds a baseline price per existing listing. Getting that wrong is not cosmetic: a
 * second run that seeds again gives every listing a duplicate starting point, which draws a flat
 * leading segment on every chart and makes the first real change look like the second one.
 */
describe('migration 28 - price history', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        price INTEGER,
        created_at INTEGER
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

  const addListing = (id, price, createdAt = 1_600_000_000_000) =>
    db.prepare(`INSERT INTO listings (id, price, created_at) VALUES (?,?,?)`).run(id, price, createdAt);
  const settingValue = (name) => db.prepare(`SELECT value FROM settings WHERE name = ?`).get(name)?.value;
  const history = () => db.prepare(`SELECT * FROM listing_price_history ORDER BY listing_id`).all();
  const columns = () =>
    db
      .prepare(`PRAGMA table_info(listings)`)
      .all()
      .map((column) => column.name);

  it('creates the history table and the three listing columns', () => {
    up(db);
    expect(columns()).toEqual(expect.arrayContaining(['previous_price', 'price_changed_at', 'last_price_check_at']));
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((row) => row.name);
    expect(tables).toContain('listing_price_history');
  });

  it('seeds a baseline observation per priced listing, stamped with its creation time', () => {
    addListing('a', 1200, 1_700_000_000_000);
    addListing('b', 900, 1_700_000_001_000);
    up(db);

    const rows = history();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ listing_id: 'a', price: 1200, observed_at: 1_700_000_000_000, source: 'backfill' });
    expect(rows[1]).toMatchObject({ listing_id: 'b', price: 900, source: 'backfill' });
  });

  it('skips listings that never had a price', () => {
    addListing('a', null);
    up(db);
    expect(history()).toHaveLength(0);
  });

  it('does not seed a second baseline when re-run', () => {
    addListing('a', 1200);
    up(db);
    up(db);
    expect(history()).toHaveLength(1);
  });

  it('seeds the settings off by default', () => {
    up(db);
    expect(JSON.parse(settingValue('priceTrackingEnabled'))).toBe(false);
    expect(JSON.parse(settingValue('priceCheckIntervalDays'))).toBe(DEFAULT_PRICE_CHECK_INTERVAL_DAYS);
    expect(JSON.parse(settingValue('priceCheckLimitPerRun'))).toBe(DEFAULT_PRICE_CHECK_LIMIT_PER_RUN);
  });

  it('leaves a value the operator already set alone', () => {
    db.prepare(
      `INSERT INTO settings (id, create_date, name, value, user_id) VALUES ('x', 1, 'priceCheckIntervalDays', '3', NULL)`,
    ).run();
    up(db);
    expect(JSON.parse(settingValue('priceCheckIntervalDays'))).toBe(3);
  });
});
