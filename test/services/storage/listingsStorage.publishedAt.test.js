/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The date the portal states, from the insert that writes it to the order the list reads in.
 *
 * Plain SQL on both sides, so the mocked connection is backed by a real in-memory database rather
 * than by assertions about statement strings. Whether `COALESCE` picks the stored date or the new
 * one, and whether an `ON CONFLICT` branch runs at all, are exactly the kind of thing that reads
 * correctly and behaves otherwise.
 */
let db;

vi.mock('../../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    getConnection: () => db,
    query: (sql, params) => db.prepare(sql).all(params ?? {}),
    execute: (sql, params) => db.prepare(sql).run(params ?? {}),
    withTransaction: (callback) => db.transaction(() => callback(db))(),
  },
}));
vi.mock('../../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));

const USER = 'user-1';

/**
 * A parsed listing as the pipeline hands it to `storeListings`.
 *
 * @param {string} hash - The provider's own hash, which becomes the row's `hash`.
 * @param {Object} [overrides]
 * @returns {Object}
 */
const listing = (hash, overrides = {}) => ({
  id: hash,
  price: 1000,
  size: 60,
  rooms: 2,
  title: `Flat ${hash}`,
  image: null,
  description: 'nice',
  address: 'Hauptstrasse 1',
  link: `https://example.com/${hash}`,
  ...overrides,
});

describe('listings published_at', () => {
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
        hash TEXT,
        provider TEXT,
        job_id TEXT,
        price REAL,
        size REAL,
        rooms REAL,
        build_year INTEGER,
        energy_class TEXT,
        title TEXT,
        image_url TEXT,
        description TEXT,
        address TEXT,
        link TEXT,
        created_at INTEGER,
        published_at INTEGER,
        is_active INTEGER,
        manually_deleted INTEGER DEFAULT 0,
        latitude REAL,
        longitude REAL,
        distances TEXT,
        notes TEXT,
        status TEXT,
        price_per_sqm REAL,
        UNIQUE (job_id, hash)
      );
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
      -- Empty, but every listing page reads the travel times of the rows it returned, so the
      -- query fails before it can be asserted on if the table is missing.
      CREATE TABLE listing_travel_times (
        listing_id TEXT NOT NULL,
        label TEXT NOT NULL,
        transit_minutes INTEGER,
        car_minutes INTEGER,
        bike_minutes INTEGER,
        walk_minutes INTEGER,
        is_estimate INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (listing_id, label)
      );
      INSERT INTO jobs (id, user_id, name, deal_type) VALUES ('job-1', '${USER}', 'Job', 'rent');
    `);

    vi.resetModules();
    listingsStorage = await import('../../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  /**
   * @param {string} hash
   * @returns {number|null}
   */
  const storedDate = (hash) => db.prepare('SELECT published_at FROM listings WHERE hash = ?').get(hash).published_at;

  describe('storeListings', () => {
    it('writes the date the provider read off the portal', () => {
      listingsStorage.storeListings('job-1', 'immowelt', [listing('dated', { publishedAt: 1757000000000 })]);

      expect(storedDate('dated')).toBe(1757000000000);
    });

    it('leaves the column empty for a portal that states nothing', () => {
      listingsStorage.storeListings('job-1', 'immowelt', [listing('dateless')]);

      expect(storedDate('dateless')).toBeNull();
    });

    it('refuses anything that is not an epoch, rather than storing it', () => {
      listingsStorage.storeListings('job-1', 'immowelt', [
        listing('a-string', { publishedAt: '2026-09-04' }),
        listing('not-a-number', { publishedAt: Number.NaN }),
        listing('null-date', { publishedAt: null }),
      ]);

      expect(storedDate('a-string')).toBeNull();
      expect(storedDate('not-a-number')).toBeNull();
      expect(storedDate('null-date')).toBeNull();
    });

    it('fills a date the stored row is missing when a later run learns it', () => {
      listingsStorage.storeListings('job-1', 'immowelt', [listing('later')]);
      listingsStorage.storeListings('job-1', 'immowelt', [listing('later', { publishedAt: 1757000000000 })]);

      expect(db.prepare('SELECT COUNT(*) AS c FROM listings').get().c).toBe(1);
      expect(storedDate('later')).toBe(1757000000000);
    });

    it('keeps the date it already has when the run carries none', () => {
      listingsStorage.storeListings('job-1', 'immowelt', [listing('kept', { publishedAt: 1757000000000 })]);
      listingsStorage.storeListings('job-1', 'immoscout', [listing('kept')]);

      expect(storedDate('kept')).toBe(1757000000000);
    });

    it('still hands the conflicting row its own id back', () => {
      const first = [listing('shared')];
      listingsStorage.storeListings('job-1', 'immowelt', first);
      const second = [listing('shared', { publishedAt: 1757000000000 })];
      listingsStorage.storeListings('job-1', 'immoscout', second);

      expect(second[0].id).toBe(first[0].id);
      expect(db.prepare('SELECT 1 FROM listings WHERE id = ?').get(second[0].id)).not.toBeUndefined();
    });
  });

  describe('queryListings', () => {
    /**
     * @param {string} id
     * @param {number} createdAt
     * @param {number|null} publishedAt
     * @returns {void}
     */
    const addRow = (id, createdAt, publishedAt) => {
      db.prepare(
        `INSERT INTO listings (id, hash, provider, job_id, title, created_at, published_at, is_active)
         VALUES (?, ?, 'immowelt', 'job-1', ?, ?, ?, 1)`,
      ).run(id, id, id, createdAt, publishedAt);
    };

    /**
     * @param {Object} [params]
     * @returns {string[]}
     */
    const idsFrom = (params = {}) =>
      listingsStorage.queryListings({ userId: USER, pageSize: 100, ...params }).result.map((row) => row.id);

    it('orders by the portal date by default, falling back to when Fredy found the listing', () => {
      // Found in the order young, middle, old - the portal says the opposite.
      addRow('found-first', 3000, 1000);
      addRow('found-second', 2000, 3000);
      addRow('never-dated', 2500, null);

      expect(idsFrom()).toEqual(['found-second', 'never-dated', 'found-first']);
    });

    it('sorts by the same expression when the caller asks for published_at', () => {
      addRow('old-advert', 3000, 1000);
      addRow('new-advert', 2000, 3000);
      addRow('never-dated', 2500, null);

      expect(idsFrom({ sortField: 'published_at', sortDir: 'asc' })).toEqual([
        'old-advert',
        'never-dated',
        'new-advert',
      ]);
    });

    it('still sorts by the date Fredy found the listing when asked for created_at', () => {
      addRow('found-first', 3000, 1000);
      addRow('found-second', 2000, 3000);

      expect(idsFrom({ sortField: 'created_at', sortDir: 'desc' })).toEqual(['found-first', 'found-second']);
    });
  });
});
