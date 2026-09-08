/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { MIN_SAMPLE } from '../../../lib/services/listings/marketBenchmark.js';

/**
 * The benchmark against the real query rather than a stub of it.
 *
 * The module's own tests pin the arithmetic with a fake executor. What is left to prove is the half
 * that only SQL can get wrong: that the bounding box actually narrows to the neighbourhood, that a
 * purchase never lands in a rental's median, and that a soft-deleted duplicate does not get to vote
 * on what the area costs twice.
 */
describe('market benchmark against the listings table', () => {
  let db;
  let listingsStorage;

  /** Cologne cathedral. */
  const LAT = 50.9413;
  const LNG = 6.958;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        deal_type TEXT
      );
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        price INTEGER,
        size INTEGER,
        latitude REAL,
        longitude REAL,
        is_active INTEGER DEFAULT 1,
        manually_deleted INTEGER DEFAULT 0,
        price_per_sqm REAL,
        market_median_sqm REAL,
        market_sample_size INTEGER,
        market_radius_km REAL
      );
    `);
    db.prepare(`INSERT INTO jobs (id, deal_type) VALUES ('rent-job', 'rent')`).run();
    db.prepare(`INSERT INTO jobs (id, deal_type) VALUES ('buy-job', 'buy')`).run();

    vi.resetModules();
    vi.doMock('../../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params),
        execute: (sql, params) => db.prepare(sql).run(params),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    vi.doMock('../../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
    listingsStorage = await import('../../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => {
    db.close();
  });

  /**
   * @param {string} id
   * @param {Object} options
   * @param {string} [options.jobId='rent-job']
   * @param {number} [options.price=500]
   * @param {number} [options.size=50]
   * @param {number} [options.km=1] Kilometres due north of the cathedral.
   * @param {number} [options.deleted=0]
   */
  const addListing = (id, { jobId = 'rent-job', price = 500, size = 50, km = 1, deleted = 0 } = {}) =>
    db
      .prepare(
        `INSERT INTO listings (id, job_id, price, size, latitude, longitude, manually_deleted, price_per_sqm)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(id, jobId, price, size, LAT + km / 111.32, LNG, deleted, price / size);

  const rowOf = (id) => db.prepare(`SELECT * FROM listings WHERE id = ?`).get(id);

  it('writes the median, the sample size and the radius onto the listing', () => {
    for (let index = 0; index < MIN_SAMPLE; index += 1) {
      addListing(`neighbour-${index}`, { price: 500 });
    }
    addListing('target', { price: 400 });

    listingsStorage.applyMarketBenchmark('rent-job', [{ id: 'target', latitude: LAT, longitude: LNG }]);

    const row = rowOf('target');
    expect(row.market_median_sqm).toBe(10);
    expect(row.market_sample_size).toBe(MIN_SAMPLE);
    expect(row.market_radius_km).toBe(5);
  });

  it('leaves the columns empty when there is nothing worth comparing against', () => {
    for (let index = 0; index < MIN_SAMPLE - 1; index += 1) {
      addListing(`neighbour-${index}`);
    }
    addListing('target');

    listingsStorage.applyMarketBenchmark('rent-job', [{ id: 'target', latitude: LAT, longitude: LNG }]);

    const row = rowOf('target');
    expect(row.market_median_sqm).toBeNull();
    expect(row.market_sample_size).toBeNull();
  });

  it('never measures a rental against purchase prices', () => {
    // Enough purchases to satisfy the sample on their own, at three orders of magnitude more per
    // square metre. If the deal type were ignored the median would come out in the thousands.
    for (let index = 0; index < MIN_SAMPLE * 2; index += 1) {
      addListing(`purchase-${index}`, { jobId: 'buy-job', price: 250000 });
    }
    for (let index = 0; index < MIN_SAMPLE; index += 1) {
      addListing(`rental-${index}`, { price: 500 });
    }
    addListing('target', { price: 480 });

    listingsStorage.applyMarketBenchmark('rent-job', [{ id: 'target', latitude: LAT, longitude: LNG }]);

    expect(rowOf('target').market_median_sqm).toBe(10);
  });

  it('ignores soft-deleted rows, which are duplicates of listings already in the sample', () => {
    for (let index = 0; index < MIN_SAMPLE; index += 1) {
      addListing(`neighbour-${index}`, { price: 500 });
    }
    for (let index = 0; index < MIN_SAMPLE * 3; index += 1) {
      addListing(`tombstone-${index}`, { price: 2000, deleted: 1 });
    }
    addListing('target', { price: 500 });

    listingsStorage.applyMarketBenchmark('rent-job', [{ id: 'target', latitude: LAT, longitude: LNG }]);

    expect(rowOf('target').market_median_sqm).toBe(10);
  });

  it('does not let a listing into the sample it is measured against', () => {
    // Eight neighbours at 10 and the listing itself at 100. Counted, the median would move; the
    // outlier would partly hide itself.
    for (let index = 0; index < MIN_SAMPLE; index += 1) {
      addListing(`neighbour-${index}`, { price: 500 });
    }
    addListing('target', { price: 5000 });

    listingsStorage.applyMarketBenchmark('rent-job', [{ id: 'target', latitude: LAT, longitude: LNG }]);

    expect(rowOf('target').market_median_sqm).toBe(10);
  });

  it('leaves a job with no deal type alone rather than guessing one', () => {
    db.prepare(`INSERT INTO jobs (id, deal_type) VALUES ('undecided', NULL)`).run();
    for (let index = 0; index < MIN_SAMPLE; index += 1) {
      addListing(`neighbour-${index}`);
    }
    addListing('target', { jobId: 'undecided' });

    listingsStorage.applyMarketBenchmark('undecided', [{ id: 'target', latitude: LAT, longitude: LNG }]);

    expect(rowOf('target').market_median_sqm).toBeNull();
  });

  it('reports one median per square metre for the deal type with the most measured listings', () => {
    for (let index = 0; index < 5; index += 1) {
      addListing(`rental-${index}`, { price: 500 });
    }
    for (let index = 0; index < 3; index += 1) {
      addListing(`purchase-${index}`, { jobId: 'buy-job', price: 250000 });
    }

    const kpis = listingsStorage.getListingsKpisForJobIds(['rent-job', 'buy-job']);

    expect(kpis.medianPricePerSqm).toEqual({ dealType: 'rent', value: 10, sampleSize: 5 });
  });

  it('has no median per square metre before anything has a size', () => {
    expect(listingsStorage.getListingsKpisForJobIds(['rent-job']).medianPricePerSqm).toBeNull();
    expect(listingsStorage.getListingsKpisForJobIds([]).medianPricePerSqm).toBeNull();
  });
});
