/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/33.repair-estimate-mode.js';

/**
 * Migration 31 gained `estimate_mode` after it had already shipped, and the runner never re-runs a
 * migration it has recorded. Instances that applied 31 before that edit are stuck without the
 * column, and every travel-time write throws. These tests pin the repair.
 */
describe('migration 33 - repair listing_travel_times.estimate_mode', () => {
  let db;

  const columns = () =>
    db
      .prepare(`PRAGMA table_info(listing_travel_times)`)
      .all()
      .map((column) => column.name);

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => db.close());

  /** The shape an instance that applied the original migration 31 was left with. */
  const createLegacyTable = () =>
    db.exec(`
      CREATE TABLE listing_travel_times (
        listing_id TEXT NOT NULL,
        label TEXT NOT NULL,
        transit_minutes INTEGER,
        car_minutes INTEGER,
        is_estimate INTEGER NOT NULL DEFAULT 1,
        computed_at INTEGER
      );
    `);

  it('adds the column when it is missing', () => {
    createLegacyTable();
    expect(columns()).not.toContain('estimate_mode');

    up(db);

    expect(columns()).toContain('estimate_mode');
  });

  it('lets a write that names the column succeed afterwards', () => {
    createLegacyTable();
    up(db);

    expect(() =>
      db
        .prepare(
          `INSERT INTO listing_travel_times (listing_id, label, estimate_mode, is_estimate)
           VALUES ('l1', 'Home', 'transit', 1)`,
        )
        .run(),
    ).not.toThrow();

    expect(db.prepare(`SELECT estimate_mode FROM listing_travel_times WHERE listing_id = 'l1'`).get()).toEqual({
      estimate_mode: 'transit',
    });
  });

  it('leaves existing rows in place, with the new column null', () => {
    createLegacyTable();
    db.prepare(`INSERT INTO listing_travel_times (listing_id, label, transit_minutes) VALUES ('l1', 'Home', 12)`).run();

    up(db);

    expect(db.prepare(`SELECT listing_id, transit_minutes, estimate_mode FROM listing_travel_times`).all()).toEqual([
      { listing_id: 'l1', transit_minutes: 12, estimate_mode: null },
    ]);
  });

  it('is a no-op on an instance that already has the column', () => {
    createLegacyTable();
    db.exec(`ALTER TABLE listing_travel_times ADD COLUMN estimate_mode TEXT`);
    const before = columns();

    up(db);

    expect(columns()).toEqual(before);
  });

  it('is idempotent', () => {
    createLegacyTable();
    up(db);
    const after = columns();

    up(db);

    expect(columns()).toEqual(after);
  });

  it('does nothing when the table does not exist at all', () => {
    expect(() => up(db)).not.toThrow();
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all()).toEqual([]);
  });
});
