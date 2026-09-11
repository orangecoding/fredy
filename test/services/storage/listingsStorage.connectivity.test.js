/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { filterMask, packMobile } from '../../../lib/services/connectivity/mobileBits.js';

/**
 * The connectivity columns and the queries that read them.
 *
 * Plain SQL on both sides, so the mocked connection is backed by a real in-memory database rather
 * than by assertions about statement strings - a bitmask comparison and a `>=` on a nullable column
 * are exactly the kind of thing that reads correctly and behaves otherwise.
 */
let db;

vi.mock('../../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    query: (sql, params = {}) => db.prepare(sql).all(params),
    withTransaction: (callback) => db.transaction((cb) => cb(db))(callback),
  },
}));
vi.mock('../../../lib/services/similarity-check/similarityCache.js', () => ({
  removeEntry: () => {},
  isListingKnownAndAddIfNot: () => false,
  initSimilarityCache: () => {},
  startSimilarityCacheReloader: () => {},
  checkAndAddEntry: () => false,
}));

const DAY = 24 * 60 * 60 * 1000;

/**
 * @param {string} id
 * @param {Object} [overrides]
 * @returns {void}
 */
function addListing(id, overrides = {}) {
  const row = {
    id,
    job_id: 'job-1',
    provider: 'immoscout',
    latitude: 52.52,
    longitude: 13.405,
    is_active: 1,
    manually_deleted: 0,
    created_at: 1000,
    connectivity: null,
    connectivity_max_down: null,
    connectivity_fiber: null,
    connectivity_mobile: null,
    connectivity_at: null,
    ...overrides,
  };
  db.prepare(
    `INSERT INTO listings (id, job_id, provider, latitude, longitude, is_active, manually_deleted, created_at,
                           connectivity, connectivity_max_down, connectivity_fiber, connectivity_mobile, connectivity_at)
     VALUES (@id, @job_id, @provider, @latitude, @longitude, @is_active, @manually_deleted, @created_at,
             @connectivity, @connectivity_max_down, @connectivity_fiber, @connectivity_mobile, @connectivity_at)`,
  ).run(row);
}

describe('listingsStorage connectivity', () => {
  let storage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id                    TEXT PRIMARY KEY,
        job_id                TEXT,
        provider              TEXT,
        title                 TEXT,
        address               TEXT,
        price                 REAL,
        size                  REAL,
        rooms                 REAL,
        status                JSON,
        distances             JSONB,
        latitude              REAL,
        longitude             REAL,
        created_at            INTEGER,
        published_at          INTEGER,
        is_active             INTEGER,
        manually_deleted      INTEGER DEFAULT 0,
        connectivity          JSON,
        connectivity_max_down INTEGER,
        connectivity_fiber    INTEGER,
        connectivity_mobile   INTEGER,
        connectivity_at       INTEGER
      );
      CREATE TABLE jobs (id TEXT PRIMARY KEY, name TEXT, deal_type TEXT, user_id TEXT);
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
      CREATE TABLE listing_travel_times (
        listing_id TEXT, label TEXT, transit_minutes INTEGER, car_minutes INTEGER,
        bike_minutes INTEGER, walk_minutes INTEGER, is_estimate INTEGER, transit_geometry TEXT,
        car_geometry TEXT, bike_geometry TEXT, walk_geometry TEXT
      );
      INSERT INTO jobs (id, name, deal_type, user_id) VALUES ('job-1', 'Job', 'rent', 'user-1');
    `);
    storage = await import('../../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  describe('the work list', () => {
    it('picks up a listing nobody has asked about yet', () => {
      addListing('never-asked');

      const due = storage.getListingsToEnrichConnectivity({ limit: 10, maxAgeDays: 180, now: 10 * DAY });

      expect(due.map((row) => row.id)).toEqual(['never-asked']);
    });

    it('leaves a fresh answer alone and picks up a stale one', () => {
      addListing('fresh', { connectivity_at: 100 * DAY });
      addListing('stale', { connectivity_at: 1 * DAY });

      const due = storage.getListingsToEnrichConnectivity({ limit: 10, maxAgeDays: 30, now: 120 * DAY });

      expect(due.map((row) => row.id)).toEqual(['stale']);
    });

    it('skips a listing with no coordinates to look up', () => {
      addListing('nowhere', { latitude: null, longitude: null });
      // -1/-1 is what the geocoder stores for "looked and found nothing", not a place in the sea.
      addListing('not-found', { latitude: -1, longitude: -1 });
      addListing('located');

      const due = storage.getListingsToEnrichConnectivity({ limit: 10, maxAgeDays: 180, now: 10 * DAY });

      expect(due.map((row) => row.id)).toEqual(['located']);
    });

    it('skips inactive and hidden listings', () => {
      addListing('inactive', { is_active: 0 });
      addListing('hidden', { manually_deleted: 1 });
      addListing('live');

      const due = storage.getListingsToEnrichConnectivity({ limit: 10, maxAgeDays: 180, now: 10 * DAY });

      expect(due.map((row) => row.id)).toEqual(['live']);
    });

    it('honours the batch size, so a backlog is worked through over several runs', () => {
      for (let index = 0; index < 5; index += 1) {
        addListing(`l${index}`);
      }

      expect(storage.getListingsToEnrichConnectivity({ limit: 2, maxAgeDays: 180, now: 10 * DAY })).toHaveLength(2);
    });

    it('takes the never-asked listings before the ones merely due again', () => {
      // Otherwise an instance upgrading into the feature would keep re-checking the handful it has
      // already done while the back catalogue waits.
      addListing('asked-long-ago', { connectivity_at: 1 * DAY });
      addListing('never-asked');

      const due = storage.getListingsToEnrichConnectivity({ limit: 10, maxAgeDays: 30, now: 120 * DAY });

      expect(due.map((row) => row.id)).toEqual(['never-asked', 'asked-long-ago']);
    });
  });

  describe('storing an answer', () => {
    it('writes the payload and the columns the filters read', () => {
      addListing('l1');
      const connectivity = { maxDownMbit: 1000, fiber: true, source: 'de-bba' };

      storage.updateListingConnectivity('l1', connectivity, { maxDown: 1000, fiber: 1, mobile: 6 }, 5000);

      const row = db.prepare(`SELECT * FROM listings WHERE id = 'l1'`).get();
      expect(JSON.parse(row.connectivity)).toEqual(connectivity);
      expect(row.connectivity_max_down).toBe(1000);
      expect(row.connectivity_fiber).toBe(1);
      expect(row.connectivity_mobile).toBe(6);
      expect(row.connectivity_at).toBe(5000);
    });

    it('stamps a lookup that found nothing, so it is not retried every run', () => {
      addListing('l1');

      storage.updateListingConnectivity('l1', null, { maxDown: null, fiber: null, mobile: null }, 5000);

      const row = db.prepare(`SELECT * FROM listings WHERE id = 'l1'`).get();
      expect(row.connectivity).toBeNull();
      expect(row.connectivity_at).toBe(5000);
      expect(
        storage.getListingsToEnrichConnectivity({ limit: 10, maxAgeDays: 180, now: 5000 }).map((r) => r.id),
      ).toEqual([]);
    });
  });

  describe('filtering the overview', () => {
    /** @param {Object} filters @returns {string[]} */
    const idsFor = (filters) =>
      storage
        .queryListings({ isAdmin: true, ...filters })
        .result.map((row) => row.id)
        .sort();

    beforeEach(() => {
      addListing('gigabit-fibre', {
        connectivity_max_down: 1000,
        connectivity_fiber: 1,
        connectivity_mobile: packMobile({ operators: { dt: { '5g': true } } }),
        connectivity_at: 1,
      });
      addListing('gigabit-cable', {
        connectivity_max_down: 1000,
        connectivity_fiber: 0,
        connectivity_mobile: packMobile({ operators: { vf: { '4g': true } } }),
        connectivity_at: 1,
      });
      addListing('slow', {
        connectivity_max_down: 50,
        connectivity_fiber: 0,
        connectivity_mobile: packMobile({ neutral: { '4g': true } }),
        connectivity_at: 1,
      });
      addListing('never-enriched');
    });

    it('returns everything when no connectivity filter is set', () => {
      expect(idsFor({})).toEqual(['gigabit-cable', 'gigabit-fibre', 'never-enriched', 'slow']);
    });

    it('keeps only the addresses that reach the speed floor', () => {
      expect(idsFor({ connectivityMinDown: 100 })).toEqual(['gigabit-cable', 'gigabit-fibre']);
      expect(idsFor({ connectivityMinDown: 30 })).toEqual(['gigabit-cable', 'gigabit-fibre', 'slow']);
    });

    it('drops a listing nobody has looked up yet', () => {
      // The same answer the commute filter gives for a listing it has never measured: a filter can
      // only speak about what it knows, and a NULL is not a promise of anything.
      expect(idsFor({ connectivityMinDown: 30 })).not.toContain('never-enriched');
      expect(idsFor({ connectivityFiberOnly: true })).not.toContain('never-enriched');
    });

    it('tells fibre apart from a cable line that happens to be just as fast', () => {
      expect(idsFor({ connectivityFiberOnly: true })).toEqual(['gigabit-fibre']);
    });

    it('finds a technology whoever provides it', () => {
      expect(idsFor({ connectivityMobileMask: filterMask('4g') })).toEqual(['gigabit-cable', 'slow']);
    });

    it('does not answer for the wrong operator', () => {
      expect(idsFor({ connectivityMobileMask: filterMask('5g', 'dt') })).toEqual(['gigabit-fibre']);
      expect(idsFor({ connectivityMobileMask: filterMask('5g', 'vf') })).toEqual([]);
    });

    it('combines with the other filters rather than replacing them', () => {
      expect(idsFor({ connectivityMinDown: 100, connectivityFiberOnly: true })).toEqual(['gigabit-fibre']);
    });
  });
});
