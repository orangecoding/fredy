/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The travel time filter turns a mode name from the request into a column name. A whitelist keeps
 * anything else out, but a whitelist that maps to a column SQLite does not have would still be a
 * broken query - and against a mocked connection it would look fine.
 *
 * So this runs the real `queryListings` against a real in-memory database, and asserts on the rows
 * that come back. The same goes for the hydration afterwards, which is a second statement whose
 * results have to land on the right listings.
 */

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params) => db.prepare(sql).all(params ?? {}),
    execute: (sql, params) => db.prepare(sql).run(params ?? {}),
    withTransaction: (fn) => db.transaction(fn)(db),
  },
}));
vi.mock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));

const USER = 'user-1';

describe('queryListings travel time filter against real SQLite', () => {
  let listingsStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT,
        shared_with_user TEXT DEFAULT '[]',
        deal_type TEXT
      );
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        price REAL,
        title TEXT,
        status TEXT,
        distances TEXT,
        created_at INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        manually_deleted INTEGER DEFAULT 0
      );
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
      CREATE TABLE listing_travel_times (
        listing_id TEXT NOT NULL,
        label TEXT NOT NULL,
        origin_lat REAL,
        origin_lng REAL,
        transit_minutes INTEGER,
        transit_transfers INTEGER,
        car_minutes INTEGER,
        car_distance_meters INTEGER,
        car_geometry TEXT,
        bike_minutes INTEGER,
        walk_minutes INTEGER,
        origin_name TEXT,
        origin_ref TEXT,
        estimate_mode TEXT,
        is_estimate INTEGER NOT NULL DEFAULT 1,
        reference_time INTEGER,
        computed_at INTEGER,
        PRIMARY KEY (listing_id, label)
      );
    `);

    db.prepare(`INSERT INTO jobs (id, user_id, name, deal_type) VALUES (?, ?, ?, 'rent')`).run(
      'job-1',
      USER,
      'Renting job',
    );

    const insertListing = db.prepare(`INSERT INTO listings (id, job_id, price, title) VALUES (?, 'job-1', 900, ?)`);
    for (const id of ['near', 'far', 'car-only', 'unrouted']) {
      insertListing.run(id, id);
    }

    const insertTime = db.prepare(
      `INSERT INTO listing_travel_times
        (listing_id, label, transit_minutes, transit_transfers, car_minutes, is_estimate, reference_time, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
    );
    insertTime.run('near', 'Home', 20, 1, 12, 1);
    insertTime.run('near', 'Work', 55, 2, 30, 1);
    insertTime.run('far', 'Home', 70, 3, 40, 1);
    // Reachable by road but not by timetable: exactly the case a NULL must not be read as a zero.
    insertTime.run('car-only', 'Home', null, null, 18, 0);
    // 'unrouted' deliberately gets no row at all.

    vi.resetModules();
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  /** @returns {string[]} The ids the query returned, sorted for a stable comparison. */
  const idsFor = (travelTimeFilter) =>
    listingsStorage
      .queryListings({ userId: USER, pageSize: 100, travelTimeFilter })
      .result.map((row) => row.id)
      .sort();

  it('binds the whitelisted column without throwing', () => {
    expect(() => idsFor({ mode: 'transit', maxMinutes: 30 })).not.toThrow();
  });

  it('keeps only listings under the ceiling', () => {
    expect(idsFor({ mode: 'transit', maxMinutes: 30 })).toEqual(['near']);
    expect(idsFor({ mode: 'transit', maxMinutes: 60 })).toEqual(['near']);
    expect(idsFor({ mode: 'transit', maxMinutes: 90 })).toEqual(['far', 'near']);
  });

  it('matches any address when no label is given', () => {
    // 'near' qualifies through Home at 20 minutes even though Work is 55.
    expect(idsFor({ mode: 'transit', maxMinutes: 25 })).toEqual(['near']);
  });

  it('measures against one address when a label is given', () => {
    expect(idsFor({ mode: 'transit', maxMinutes: 25, label: 'Work' })).toEqual([]);
    expect(idsFor({ mode: 'transit', maxMinutes: 60, label: 'Work' })).toEqual(['near']);
  });

  it('switches column with the mode', () => {
    expect(idsFor({ mode: 'car', maxMinutes: 20 })).toEqual(['car-only', 'near']);
  });

  it('never reads a missing time as a zero', () => {
    // 'car-only' has no transit time at all, so no transit ceiling may ever match it.
    expect(idsFor({ mode: 'transit', maxMinutes: 999 })).not.toContain('car-only');
  });

  it('ignores an unusable filter rather than emptying the page', () => {
    // A mode outside the whitelist must not reach the SQL, and must not silently exclude everything.
    expect(idsFor({ mode: 'teleport', maxMinutes: 5 })).toHaveLength(4);
    expect(idsFor({ mode: 'transit', maxMinutes: 0 })).toHaveLength(4);
    expect(idsFor(null)).toHaveLength(4);
  });

  it('hydrates each row with its own travel times, one entry per address', () => {
    const rows = listingsStorage.queryListings({ userId: USER, pageSize: 100 }).result;
    const byId = new Map(rows.map((row) => [row.id, row]));

    // Two addresses must not turn one listing into two rows.
    expect(rows).toHaveLength(4);
    expect(byId.get('near').travelTimes).toHaveLength(2);
    expect(byId.get('near').travelTimes.find((entry) => entry.label === 'Home')).toMatchObject({
      transit: { minutes: 20, transfers: 1 },
      car: { minutes: 12, distanceMeters: null },
      estimate: true,
    });
    expect(byId.get('car-only').travelTimes[0].transit).toBeUndefined();
    expect(byId.get('car-only').travelTimes[0].estimate).toBe(false);
    expect(byId.get('unrouted').travelTimes).toBeUndefined();
  });

  it('carries the mode each address is measured in, so a card can lead with it', () => {
    db.prepare(`UPDATE listing_travel_times SET estimate_mode = 'car' WHERE listing_id = 'car-only'`).run();

    const rows = listingsStorage.queryListings({ userId: USER, pageSize: 100 }).result;
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get('car-only').travelTimes[0].mode).toBe('car');
    // Written before the mode was recorded. Null rather than a guess: the UI falls back on its own.
    expect(byId.get('near').travelTimes[0].mode).toBeNull();
  });

  it('keeps the encoded driving route off list pages and puts it on the single listing', () => {
    db.prepare(`UPDATE listing_travel_times SET car_geometry = 'abc' WHERE listing_id = 'near'`).run();

    const listed = listingsStorage.queryListings({ userId: USER, pageSize: 100 }).result.find((r) => r.id === 'near');
    expect(listed.travelTimes.every((entry) => entry.car?.geometry === undefined)).toBe(true);

    const single = listingsStorage.getListingById('near', USER);
    expect(single.travelTimes.some((entry) => entry.car?.geometry === 'abc')).toBe(true);
  });
});

describe('the place a place type resolved to', () => {
  let listingsStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listing_travel_times (
        listing_id TEXT NOT NULL,
        label TEXT NOT NULL,
        origin_lat REAL,
        origin_lng REAL,
        transit_minutes INTEGER,
        transit_transfers INTEGER,
        transit_legs TEXT,
        car_minutes INTEGER,
        car_distance_meters INTEGER,
        car_geometry TEXT,
        bike_minutes INTEGER,
        bike_geometry TEXT,
        walk_minutes INTEGER,
        walk_geometry TEXT,
        via_stops TEXT,
        origin_name TEXT,
        origin_ref TEXT,
        estimate_mode TEXT,
        is_estimate INTEGER,
        reference_time INTEGER,
        computed_at INTEGER,
        PRIMARY KEY (listing_id, label)
      );
    `);
    const insert = db.prepare(
      `INSERT INTO listing_travel_times
        (listing_id, label, origin_lat, origin_lng, walk_minutes, origin_name, origin_ref, estimate_mode,
         is_estimate, reference_time, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
    );
    insert.run('l1', 'Groceries', 52.51, 13.4, 6, 'REWE', 'supermarket', 'walk', 0);
    insert.run('l1', 'Work', 52.52, 13.41, 25, null, null, 'walk', 0);
    // Looked, and there is nothing of that kind for miles. -1 is this codebase's marker for that.
    insert.run('l1', 'Pharmacy', -1, -1, null, null, 'pharmacy', 'walk', 0);

    vi.resetModules();
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  it('reports which place was measured, so the page can show its working', () => {
    const [row] = listingsStorage.attachTravelTimes([{ id: 'l1' }]);
    const entry = row.travelTimes.find((candidate) => candidate.label === 'Groceries');

    expect(entry.place).toEqual({ name: 'REWE', lat: 52.51, lng: 13.4, category: 'supermarket' });
  });

  it('says nothing about a place for a named address, which is its own answer', () => {
    const [row] = listingsStorage.attachTravelTimes([{ id: 'l1' }]);
    const entry = row.travelTimes.find((candidate) => candidate.label === 'Work');

    expect(entry.place).toBeUndefined();
  });

  it('reports no place when the search found none', () => {
    const [row] = listingsStorage.attachTravelTimes([{ id: 'l1' }]);
    const entry = row.travelTimes.find((candidate) => candidate.label === 'Pharmacy');

    // A row exists so the listing stops being re-asked, but there is no supermarket in the Atlantic
    // to draw a pin on.
    expect(entry.place).toBeUndefined();
    expect(entry.walk).toBeUndefined();
  });
});

describe('how far through the travel-time backlog a user is', () => {
  let listingsStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT);
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        is_active INTEGER,
        manually_deleted INTEGER,
        latitude REAL,
        longitude REAL,
        travel_times_at INTEGER
      );
    `);
    db.prepare('INSERT INTO jobs VALUES (?, ?)').run('j1', USER);
    db.prepare('INSERT INTO jobs VALUES (?, ?)').run('j2', 'someone-else');
    const add = db.prepare('INSERT INTO listings VALUES (?, ?, ?, ?, ?, ?, ?)');
    add.run('done', 'j1', 1, 0, 52.5, 13.4, 1700000000);
    add.run('waiting', 'j1', 1, 0, 52.5, 13.4, null);
    add.run('also-waiting', 'j1', 1, 0, 52.5, 13.4, null);
    // None of these are listings the sweeper will ever visit, so none belong in the denominator.
    add.run('inactive', 'j1', 0, 0, 52.5, 13.4, null);
    add.run('deleted', 'j1', 1, 1, 52.5, 13.4, null);
    add.run('ungeocoded', 'j1', 1, 0, null, null, null);
    add.run('other-user', 'j2', 1, 0, 52.5, 13.4, null);

    vi.resetModules();
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  it('counts only the listings the sweeper will actually reach', () => {
    // A denominator that includes listings nothing will ever measure is a progress bar that never
    // finishes, which is worse than showing none at all.
    expect(listingsStorage.getTravelTimeProgress(USER)).toEqual({ measured: 1, total: 3 });
  });

  it('answers zero rather than null for a user with nothing to measure', () => {
    expect(listingsStorage.getTravelTimeProgress('nobody')).toEqual({ measured: 0, total: 0 });
  });
});
