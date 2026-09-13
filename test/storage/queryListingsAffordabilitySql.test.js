/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The sibling suite (queryListingsAffordability.test.js) asserts which SQL text and parameters
 * the affordability band produces, against a mocked connection. That proves the intent but not
 * that the statement actually runs: the band builds its parameter names by interpolation
 * (`@affMin_buy`, `@affMinEx_rent`, ...), and a name better-sqlite3 rejects, or a bound value it
 * refuses, would sail straight past a mock.
 *
 * So this suite runs the very same queryListings against a real in-memory SQLite database with a
 * minimal schema, and asserts on the rows that come back. If the binding is wrong, better-sqlite3
 * throws here rather than in production.
 */

let db;

// The connection singleton is replaced by a thin adapter over a real database handle.
vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params) => db.prepare(sql).all(params ?? {}),
    execute: (sql, params) => db.prepare(sql).run(params ?? {}),
    withTransaction: (fn) => db.transaction(fn)(db),
  },
}));
vi.mock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));

const USER = 'user-1';

/** Prices chosen to sit on and around the band edges, including inside the fractional gap. */
const BUY_LISTINGS = [
  { id: 'buy-cheap', price: 120000 },
  { id: 'buy-at-ceiling', price: 263511.69669265934 },
  { id: 'buy-in-gap', price: 263511.8 },
  { id: 'buy-stretch', price: 290000 },
  { id: 'buy-far', price: 900000 },
  { id: 'buy-rental-priced', price: 900 },
  { id: 'buy-no-price', price: null },
];

const RENT_LISTINGS = [
  { id: 'rent-cheap', price: 700 },
  { id: 'rent-at-ceiling', price: 1120 },
  { id: 'rent-in-gap', price: 1120.5 },
  { id: 'rent-stretch', price: 1250 },
  { id: 'rent-far', price: 3000 },
];

describe('queryListings affordability band against real SQLite', () => {
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
        size REAL,
        title TEXT,
        address TEXT,
        provider TEXT,
        link TEXT,
        status TEXT,
        distances TEXT,
        created_at INTEGER DEFAULT 0,
        published_at INTEGER,
        is_active INTEGER DEFAULT 1,
        manually_deleted INTEGER DEFAULT 0
      );
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
      -- Empty, but it has to exist: every listing page reads the travel times of the rows it
      -- returned, so a query against a schema without this table fails before it can be asserted on.
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
        is_estimate INTEGER NOT NULL DEFAULT 1,
        reference_time INTEGER,
        computed_at INTEGER,
        PRIMARY KEY (listing_id, label)
      );
    `);

    const insertJob = db.prepare(
      `INSERT INTO jobs (id, user_id, name, shared_with_user, deal_type) VALUES (?, ?, ?, '[]', ?)`,
    );
    insertJob.run('job-buy', USER, 'Buying job', 'buy');
    insertJob.run('job-rent', USER, 'Renting job', 'rent');

    const insertListing = db.prepare(`INSERT INTO listings (id, job_id, price, title) VALUES (?, ?, ?, ?)`);
    for (const row of BUY_LISTINGS) {
      insertListing.run(row.id, 'job-buy', row.price, row.id);
    }
    for (const row of RENT_LISTINGS) {
      insertListing.run(row.id, 'job-rent', row.price, row.id);
    }

    vi.resetModules();
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  /** @returns {string[]} The ids the query returned, sorted for a stable comparison. */
  const idsFor = (affordabilityBand) =>
    listingsStorage
      .queryListings({ userId: USER, pageSize: 100, affordabilityBand })
      .result.map((row) => row.id)
      .sort();

  it('binds the interpolated parameter names without throwing', () => {
    // The regression this whole file exists for: a name SQLite rejects would raise here.
    expect(() =>
      idsFor({
        buy: { min: 30000, minExclusive: 263511.69669265934, max: 290000 },
        rent: { minExclusive: 0, max: 1120 },
      }),
    ).not.toThrow();
  });

  it('applies each window only to listings of its own deal type', () => {
    const ids = idsFor({ buy: { min: 30000, max: 263511.69669265934 }, rent: { minExclusive: 0, max: 1120 } });

    // Buy rows judged by the buy window, rent rows by the rent window, and neither leaks into
    // the other despite sharing the one price column.
    expect(ids).toEqual(['buy-at-ceiling', 'buy-cheap', 'rent-at-ceiling', 'rent-cheap']);
  });

  it('drops listings of a deal type whose profile half is missing', () => {
    expect(idsFor({ buy: { min: 30000, max: 263511.69669265934 }, rent: null })).toEqual([
      'buy-at-ceiling',
      'buy-cheap',
    ]);
    expect(idsFor({ buy: null, rent: { minExclusive: 0, max: 1120 } })).toEqual(['rent-at-ceiling', 'rent-cheap']);
  });

  it('keeps a price in the fractional gap findable, matching the verdict chip', () => {
    // A price above the affordable ceiling but below ceiling+1 gets a "stretch" chip, so the
    // stretch filter has to return it. The old inclusive `ceiling + 1` bound lost exactly this.
    const ids = idsFor({
      buy: { min: 30000, minExclusive: 263511.69669265934, max: 290000 },
      rent: { minExclusive: 1120, max: 1250 },
    });
    expect(ids).toContain('buy-in-gap');
    expect(ids).toContain('rent-in-gap');
    // And the exclusive bound really is exclusive.
    expect(ids).not.toContain('buy-at-ceiling');
    expect(ids).not.toContain('rent-at-ceiling');
  });

  it('honours an open-ended upper bound instead of matching nothing', () => {
    const ids = idsFor({ buy: { min: 30000, minExclusive: 290000, max: null }, rent: null });
    expect(ids).toEqual(['buy-far']);
  });

  it('excludes rows without a price, which can never carry a verdict', () => {
    const ids = idsFor({ buy: { min: 0, max: 1000000 }, rent: null });
    expect(ids).not.toContain('buy-no-price');
  });

  it('keeps the purchase floor, so a rental-priced row in a buy job is not judged', () => {
    const ids = idsFor({ buy: { min: 30000, max: 1000000 }, rent: null });
    expect(ids).not.toContain('buy-rental-priced');
  });

  it('composes with an explicit price range rather than overwriting it', () => {
    const result = listingsStorage.queryListings({
      userId: USER,
      pageSize: 100,
      minPrice: 200000,
      affordabilityBand: { buy: { min: 30000, max: 263511.69669265934 }, rent: null },
    });
    // The band alone would also allow buy-cheap at 120.000; minPrice narrows it further.
    expect(result.result.map((row) => row.id)).toEqual(['buy-at-ceiling']);
  });

  it('reports a total that matches the filtered rows, so pagination stays honest', () => {
    const band = { buy: { min: 30000, max: 263511.69669265934 }, rent: { minExclusive: 0, max: 1120 } };
    const result = listingsStorage.queryListings({ userId: USER, pageSize: 100, affordabilityBand: band });
    expect(result.totalNumber).toBe(result.result.length);
    expect(result.totalNumber).toBe(4);
  });

  it('exposes the job deal type on each row for the verdict chips', () => {
    const result = listingsStorage.queryListings({ userId: USER, pageSize: 100 });
    const byId = Object.fromEntries(result.result.map((row) => [row.id, row.dealType]));
    expect(byId['buy-cheap']).toBe('buy');
    expect(byId['rent-cheap']).toBe('rent');
  });

  it('lets a shared user open a listing but rejects a foreign listing', () => {
    db.prepare(`INSERT INTO jobs (id, user_id, name, shared_with_user, deal_type) VALUES (?, ?, ?, ?, 'rent')`).run(
      'job-shared',
      'owner-2',
      'Shared job',
      JSON.stringify([USER]),
    );
    db.prepare(`INSERT INTO jobs (id, user_id, name, shared_with_user, deal_type) VALUES (?, ?, ?, '[]', 'rent')`).run(
      'job-foreign',
      'owner-3',
      'Foreign job',
    );
    db.prepare(`INSERT INTO listings (id, job_id, price, title) VALUES (?, ?, 900, ?)`).run(
      'shared-listing',
      'job-shared',
      'Shared listing',
    );
    db.prepare(`INSERT INTO listings (id, job_id, price, title) VALUES (?, ?, 900, ?)`).run(
      'foreign-listing',
      'job-foreign',
      'Foreign listing',
    );

    expect(listingsStorage.getListingById('shared-listing', USER)?.id).toBe('shared-listing');
    expect(listingsStorage.getListingById('foreign-listing', USER)).toBeNull();
  });
});
