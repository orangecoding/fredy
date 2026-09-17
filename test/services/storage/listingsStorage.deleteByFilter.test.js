/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The bulk delete behind the listings overview.
 *
 * Backed by a real in-memory database rather than by assertions about statement strings: the whole
 * point of this function is that it removes exactly the rows `queryListings` returns, and the only
 * honest way to check that is to ask both and compare.
 */
let db;

const evicted = [];

vi.mock('../../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    query: (sql, params = {}) => db.prepare(sql).all(params),
    withTransaction: (callback) => db.transaction((cb) => cb(db))(callback),
  },
}));
vi.mock('../../../lib/services/similarity-check/similarityCache.js', () => ({
  removeEntry: (entry) => evicted.push(entry),
  isListingKnownAndAddIfNot: () => false,
  initSimilarityCache: () => {},
  startSimilarityCacheReloader: () => {},
  checkAndAddEntry: () => false,
}));

/**
 * @param {string} id
 * @param {Object} [overrides]
 */
function addListing(id, overrides = {}) {
  const row = {
    id,
    job_id: 'alice-job',
    provider: 'immoscout',
    title: `Flat ${id}`,
    address: 'Somewhere 1',
    price: 1000,
    size: 60,
    rooms: 2,
    is_active: 1,
    manually_deleted: 0,
    created_at: 1000,
    ...overrides,
  };
  db.prepare(
    `INSERT INTO listings (id, job_id, provider, title, address, price, size, rooms, is_active,
                           manually_deleted, created_at)
     VALUES (@id, @job_id, @provider, @title, @address, @price, @size, @rooms, @is_active,
             @manually_deleted, @created_at)`,
  ).run(row);
}

const remainingIds = () =>
  db
    .prepare(`SELECT id FROM listings ORDER BY id`)
    .all()
    .map((row) => row.id);

const hiddenIds = () =>
  db
    .prepare(`SELECT id FROM listings WHERE manually_deleted = 1 ORDER BY id`)
    .all()
    .map((row) => row.id);

describe('listingsStorage.deleteListingsByFilter', () => {
  let storage;

  beforeEach(async () => {
    evicted.length = 0;
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
        link                  TEXT,
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
      CREATE TABLE jobs (id TEXT PRIMARY KEY, name TEXT, deal_type TEXT, user_id TEXT, shared_with_user JSON);
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
      CREATE TABLE listing_attachments (
        id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, filename TEXT, mime_type TEXT,
        size INTEGER, content BLOB, created_at INTEGER
      );
      CREATE TABLE listing_travel_times (
        listing_id TEXT, label TEXT, transit_minutes INTEGER, car_minutes INTEGER,
        bike_minutes INTEGER, walk_minutes INTEGER, is_estimate INTEGER, transit_geometry TEXT,
        car_geometry TEXT, bike_geometry TEXT, walk_geometry TEXT
      );
      INSERT INTO jobs (id, name, deal_type, user_id, shared_with_user)
      VALUES ('alice-job', 'Alice Job', 'rent', 'alice', '[]'),
             ('bob-job', 'Bob Job', 'rent', 'bob', '[]'),
             ('shared-job', 'Shared Job', 'rent', 'bob', '["alice"]');
    `);
    storage = await import('../../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  it('soft deletes every listing the filter matches, across all pages', () => {
    for (let i = 0; i < 5; i++) {
      addListing(`a${i}`, { provider: 'immoscout' });
    }
    addListing('keep', { provider: 'immowelt' });

    const { changes } = storage.deleteListingsByFilter({ userId: 'alice', providerFilter: 'immoscout' });

    expect(changes).toBe(5);
    expect(hiddenIds()).toEqual(['a0', 'a1', 'a2', 'a3', 'a4']);
    expect(remainingIds()).toContain('keep');
  });

  it('removes exactly the rows the same filter would have listed', () => {
    addListing('active-immo', { provider: 'immoscout', is_active: 1 });
    addListing('inactive-immo', { provider: 'immoscout', is_active: 0 });
    addListing('active-welt', { provider: 'immowelt', is_active: 1 });

    const filters = { userId: 'alice', providerFilter: 'immoscout', activityFilter: true };
    const listed = storage.queryListings({ ...filters, pageSize: 100 }).result.map((row) => row.id);

    storage.deleteListingsByFilter(filters);

    expect(listed).toEqual(['active-immo']);
    expect(hiddenIds()).toEqual(listed);
  });

  it('hard deletes and evicts the removed rows from the similarity cache', () => {
    addListing('gone', { title: 'Nice flat' });
    addListing('stays', { provider: 'immowelt' });

    const { changes } = storage.deleteListingsByFilter({ userId: 'alice', providerFilter: 'immoscout' }, true);

    expect(changes).toBe(1);
    expect(remainingIds()).toEqual(['stays']);
    expect(evicted).toEqual([
      {
        jobId: 'alice-job',
        provider: 'immoscout',
        title: 'Nice flat',
        address: 'Somewhere 1',
        price: 1000,
        size: 60,
        rooms: 2,
      },
    ]);
  });

  it('never reaches another user’s listings, even with no filter set', () => {
    addListing('mine', { job_id: 'alice-job' });
    addListing('shared-with-me', { job_id: 'shared-job' });
    addListing('not-mine', { job_id: 'bob-job' });

    storage.deleteListingsByFilter({ userId: 'alice' }, true);

    expect(remainingIds()).toEqual(['not-mine']);
  });

  it('lets an admin through the scoping clause', () => {
    addListing('mine', { job_id: 'alice-job' });
    addListing('not-mine', { job_id: 'bob-job' });

    storage.deleteListingsByFilter({ userId: 'root', isAdmin: true }, true);

    expect(remainingIds()).toEqual([]);
  });

  it('leaves already hidden listings alone, and only the hidden view touches them', () => {
    addListing('visible');
    addListing('hidden', { manually_deleted: 1 });

    expect(storage.deleteListingsByFilter({ userId: 'alice' }).changes).toBe(1);

    storage.deleteListingsByFilter({ userId: 'alice', hiddenOnly: true }, true);

    expect(remainingIds()).toEqual([]);
  });

  it('narrows by job, free text and status like the overview does', () => {
    addListing('wanted', { job_id: 'alice-job', title: 'Altbau with balcony' });
    addListing('other-job', { job_id: 'shared-job', title: 'Altbau with balcony' });
    addListing('other-title', { job_id: 'alice-job', title: 'Neubau' });

    storage.deleteListingsByFilter({ userId: 'alice', jobIdFilter: 'alice-job', freeTextFilter: 'Altbau' }, true);

    expect(remainingIds()).toEqual(['other-job', 'other-title']);
  });

  it('is a no-op when the filter matches nothing', () => {
    addListing('untouched');

    const { changes } = storage.deleteListingsByFilter({ userId: 'alice', providerFilter: 'nonexistent' }, true);

    expect(changes).toBe(0);
    expect(remainingIds()).toEqual(['untouched']);
  });
});
