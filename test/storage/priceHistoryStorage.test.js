/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/28.price-history.js';

/**
 * The price tracking storage functions, run against a real SQLite built by the real migration.
 *
 * Worth its own suite rather than being folded into the service tests, which mock storage away: the
 * due query has to stay cheap and correctly bounded, and getting its predicates wrong is how a run
 * either re-probes the same handful of listings forever or walks the entire table in one go.
 */
describe('price history storage', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = 1_800_000_000_000;

  let db;
  let storage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        provider TEXT,
        title TEXT,
        address TEXT,
        link TEXT,
        price INTEGER,
        created_at INTEGER,
        is_active INTEGER DEFAULT 1,
        manually_deleted INTEGER DEFAULT 0
      );
      CREATE TABLE settings (
        id TEXT PRIMARY KEY,
        create_date INTEGER,
        name TEXT,
        value TEXT,
        user_id TEXT
      );
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
    `);
    up(db);

    vi.resetModules();
    vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params),
        execute: (sql, params) => db.prepare(sql).run(params),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    vi.doMock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
    storage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  const addListing = (
    id,
    { price = 1000, isActive = 1, deleted = 0, link = `https://x.de/${id}`, checked = null } = {},
  ) => {
    db.prepare(
      `INSERT INTO listings (id, job_id, provider, title, link, price, created_at, is_active, manually_deleted, last_price_check_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(id, 'job-1', 'immowelt', 'flat', link, price, NOW - 30 * DAY, isActive, deleted, checked);
  };
  const dueIds = (opts = {}) => storage.getListingsDueForPriceCheck({ now: NOW, ...opts }).map((row) => row.id);

  describe('getListingsDueForPriceCheck', () => {
    it('returns never-checked listings with everything the probe needs', () => {
      addListing('a');
      const [row] = storage.getListingsDueForPriceCheck({ now: NOW });
      expect(row).toMatchObject({
        id: 'a',
        link: 'https://x.de/a',
        provider: 'immowelt',
        price: 1000,
        job_id: 'job-1',
      });
    });

    it('leaves out inactive and manually deleted listings', () => {
      addListing('active');
      addListing('gone', { isActive: 0 });
      addListing('hidden', { deleted: 1 });
      expect(dueIds()).toEqual(['active']);
    });

    it('leaves out listings with no link to probe', () => {
      addListing('a', { link: null });
      expect(dueIds()).toEqual([]);
    });

    it('only returns listings older than the staleness window', () => {
      addListing('fresh', { checked: NOW - 1 * DAY });
      addListing('stale', { checked: NOW - 8 * DAY });
      expect(dueIds({ staleAfterMs: 7 * DAY })).toEqual(['stale']);
    });

    // Never-probed first, then oldest first, so a listing cannot be starved by a busy instance
    // whose per-run limit never reaches the end of the table.
    it('puts never-checked listings first, then the least recently checked', () => {
      addListing('old', { checked: NOW - 30 * DAY });
      addListing('never');
      addListing('older', { checked: NOW - 60 * DAY });
      expect(dueIds({ staleAfterMs: 7 * DAY })).toEqual(['never', 'older', 'old']);
    });

    it('honours the limit', () => {
      addListing('a');
      addListing('b');
      addListing('c');
      expect(dueIds({ limit: 2 })).toHaveLength(2);
    });
  });

  describe('markListingsPriceChecked', () => {
    it('takes a listing out of the due set even though no price was found', () => {
      addListing('a');
      storage.markListingsPriceChecked(['a'], NOW);
      expect(dueIds({ staleAfterMs: 7 * DAY })).toEqual([]);
    });
  });

  describe('recordPriceObservation and applyPriceChange', () => {
    it('appends to the history and moves the listing to the new price', () => {
      addListing('a', { price: 1200 });
      storage.recordPriceObservation('a', 1100, NOW, 'priceProbe');
      storage.applyPriceChange('a', 1100, NOW);

      const row = db.prepare('SELECT price, previous_price, price_changed_at FROM listings WHERE id = ?').get('a');
      expect(row).toEqual({ price: 1100, previous_price: 1200, price_changed_at: NOW });
      expect(storage.getPriceHistory('a')).toEqual([{ price: 1100, observed_at: NOW, source: 'priceProbe' }]);
    });

    it('refuses an unusable price rather than writing a zero', () => {
      addListing('a', { price: 1200 });
      storage.recordPriceObservation('a', null, NOW, 'priceProbe');
      storage.applyPriceChange('a', NaN, NOW);

      expect(storage.getPriceHistory('a')).toEqual([]);
      expect(db.prepare('SELECT price FROM listings WHERE id = ?').get('a').price).toBe(1200);
    });

    it('returns the history oldest first', () => {
      addListing('a');
      storage.recordPriceObservation('a', 1000, NOW - 2 * DAY, 'x');
      storage.recordPriceObservation('a', 900, NOW, 'x');
      storage.recordPriceObservation('a', 950, NOW - 1 * DAY, 'x');
      expect(storage.getPriceHistory('a').map((row) => row.price)).toEqual([1000, 950, 900]);
    });
  });

  // The retention purge knows nothing about price history; the foreign key is what keeps the two
  // from drifting apart.
  it('drops a listing history along with the listing', () => {
    addListing('a');
    storage.recordPriceObservation('a', 1000, NOW, 'x');
    db.prepare('DELETE FROM listings WHERE id = ?').run('a');
    expect(storage.getPriceHistory('a')).toEqual([]);
  });
});
