/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import {
  up,
  DEFAULT_MOTIS_BASE_URL,
  DEFAULT_TRAVEL_TIME_MAX_MINUTES,
} from '../../lib/services/storage/migrations/sql/31.listing-travel-times.js';

/**
 * The travel times are a child table so that every existing way of removing a listing - the
 * retention purge, deleting a job, the demo cleanup - disposes of them without knowing this feature
 * exists. That only holds if the foreign key is declared and enforced, which is what most of this
 * suite is about.
 */
describe('migration 31 - listing travel times', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        address TEXT,
        latitude REAL,
        longitude REAL,
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
    db.prepare(`INSERT INTO listings (id, address) VALUES ('l1', 'Somewhere')`).run();
  });

  afterEach(() => db.close());

  const listingColumns = () =>
    db
      .prepare(`PRAGMA table_info(listings)`)
      .all()
      .map((column) => column.name);

  const settingValue = (name) =>
    JSON.parse(db.prepare(`SELECT value FROM settings WHERE name = ?`).get(name)?.value ?? 'null');

  const addTravelTime = (listingId) =>
    db
      .prepare(
        `INSERT INTO listing_travel_times (listing_id, label, origin_lat, origin_lng, reference_time, computed_at)
         VALUES (?, 'Home', 52.5, 13.4, 0, 0)`,
      )
      .run(listingId);

  it('creates the table and the columns that drive the sweep', () => {
    up(db);

    expect(db.prepare(`SELECT name FROM sqlite_master WHERE name = 'listing_travel_times'`).get()).toBeTruthy();
    expect(listingColumns()).toContain('travel_times_at');
    expect(listingColumns()).toContain('travel_times_failures');
  });

  it('starts every existing listing due and on a clean failure counter', () => {
    up(db);

    const row = db.prepare(`SELECT travel_times_at, travel_times_failures FROM listings WHERE id = 'l1'`).get();
    // NULL is the "never looked at" signal the sweep selects on, so the backlog picks itself up.
    expect(row.travel_times_at).toBeNull();
    expect(row.travel_times_failures).toBe(0);
  });

  it('takes the rows with the listing they belong to', () => {
    up(db);
    addTravelTime('l1');

    db.prepare(`DELETE FROM listings WHERE id = 'l1'`).run();

    expect(db.prepare(`SELECT COUNT(1) AS n FROM listing_travel_times`).get().n).toBe(0);
  });

  it('refuses a row for a listing that does not exist', () => {
    up(db);

    expect(() => addTravelTime('nope')).toThrow();
  });

  it('treats a row as an estimate unless it says otherwise', () => {
    up(db);
    addTravelTime('l1');

    // The sweep produces estimates and is by far the common case; only a detail page produces the
    // exact kind, and it sets the flag explicitly.
    expect(db.prepare(`SELECT is_estimate FROM listing_travel_times`).get().is_estimate).toBe(1);
  });

  it('seeds the settings the sweep reads', () => {
    up(db);

    expect(settingValue('motisBaseUrl')).toBe(DEFAULT_MOTIS_BASE_URL);
    expect(settingValue('travelTimeMaxMinutes')).toBe(DEFAULT_TRAVEL_TIME_MAX_MINUTES);
    // Without a version in it: MOTIS versions its endpoints separately and Fredy uses two of them.
    expect(DEFAULT_MOTIS_BASE_URL).not.toMatch(/\/v\d+$/);
  });

  it('never overwrites a value the operator already set', () => {
    db.prepare(
      `INSERT INTO settings (id, create_date, name, value, user_id) VALUES ('s1', 0, 'motisBaseUrl', ?, NULL)`,
    ).run(JSON.stringify('https://motis.example.internal/api'));

    up(db);

    expect(settingValue('motisBaseUrl')).toBe('https://motis.example.internal/api');
  });

  it('repairs a table left behind by an earlier draft of this migration', () => {
    // `CREATE TABLE IF NOT EXISTS` does nothing to a table that is already there, so without the
    // separate ALTER an instance that ran a draft would fail on every insert.
    db.exec(`
      CREATE TABLE listing_travel_times (
        listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        origin_lat REAL NOT NULL,
        origin_lng REAL NOT NULL,
        reference_time INTEGER NOT NULL,
        computed_at INTEGER NOT NULL,
        PRIMARY KEY (listing_id, label)
      );
    `);

    up(db);

    expect(
      db
        .prepare(`PRAGMA table_info(listing_travel_times)`)
        .all()
        .map((column) => column.name),
    ).toContain('is_estimate');
    expect(() => addTravelTime('l1')).not.toThrow();
  });

  it('is safe to run again', () => {
    up(db);
    addTravelTime('l1');

    expect(() => up(db)).not.toThrow();
    expect(db.prepare(`SELECT COUNT(1) AS n FROM listing_travel_times`).get().n).toBe(1);
  });
});
