/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The dashboard KPI query used to pull every listing row of every accessible job into JS and sort
 * them there to produce two numbers, on the app's landing route. It is SQL now. These tests pin the
 * results against the definition the JS version used, including the even/odd median split.
 */
describe('getListingsKpisForJobIds', () => {
  let db;
  let listingsStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        price REAL,
        is_active INTEGER,
        manually_deleted INTEGER DEFAULT 0
      );
    `);

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
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  let seq = 0;
  const add = (price, { jobId = 'job-1', isActive = 1, deleted = 0 } = {}) =>
    db
      .prepare('INSERT INTO listings (id, job_id, price, is_active, manually_deleted) VALUES (?,?,?,?,?)')
      .run(`l-${seq++}`, jobId, price, isActive, deleted);

  const kpis = (jobIds = ['job-1']) => listingsStorage.getListingsKpisForJobIds(jobIds);

  /**
   * The previous in-JS implementation, kept here as the oracle the SQL version must match.
   * @param {number[]} prices
   * @returns {number}
   */
  function referenceMedian(prices) {
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  it('returns zeros without job ids', () => {
    expect(kpis([])).toEqual({ numberOfActiveListings: 0, medianPriceOfListings: 0 });
    expect(listingsStorage.getListingsKpisForJobIds()).toEqual({
      numberOfActiveListings: 0,
      medianPriceOfListings: 0,
    });
  });

  it('counts only active listings', () => {
    add(1000);
    add(1100);
    add(1200, { isActive: 0 });
    add(1300, { isActive: null });
    expect(kpis().numberOfActiveListings).toBe(2);
  });

  it('takes the middle value for an odd number of prices', () => {
    const prices = [900, 1500, 1100];
    prices.forEach((p) => add(p));
    expect(kpis().medianPriceOfListings).toBe(referenceMedian(prices));
    expect(kpis().medianPriceOfListings).toBe(1100);
  });

  it('averages the two middle values for an even number of prices', () => {
    const prices = [900, 1000, 1200, 1500];
    prices.forEach((p) => add(p));
    expect(kpis().medianPriceOfListings).toBe(referenceMedian(prices));
    expect(kpis().medianPriceOfListings).toBe(1100);
  });

  it('ignores listings without a price', () => {
    const prices = [1000, 2000, 3000];
    prices.forEach((p) => add(p));
    add(null);
    add(null);
    expect(kpis().medianPriceOfListings).toBe(referenceMedian(prices));
  });

  it('includes inactive listings in the median, matching the previous behaviour', () => {
    const prices = [1000, 2000, 3000];
    add(prices[0]);
    add(prices[1], { isActive: 0 });
    add(prices[2]);
    expect(kpis().medianPriceOfListings).toBe(referenceMedian(prices));
  });

  it('excludes hidden listings from both numbers', () => {
    add(1000);
    add(50_000, { deleted: 1 });
    expect(kpis()).toEqual({ numberOfActiveListings: 1, medianPriceOfListings: 1000 });
  });

  it('spans several jobs', () => {
    const prices = [1000, 1200, 1400, 1600, 1800];
    add(prices[0]);
    add(prices[1]);
    add(prices[2], { jobId: 'job-2' });
    add(prices[3], { jobId: 'job-2' });
    add(prices[4], { jobId: 'job-2' });
    expect(kpis(['job-1', 'job-2'])).toEqual({
      numberOfActiveListings: 5,
      medianPriceOfListings: referenceMedian(prices),
    });
  });

  it('reports a zero median when no listing has a price', () => {
    add(null);
    expect(kpis()).toEqual({ numberOfActiveListings: 1, medianPriceOfListings: 0 });
  });

  it('agrees with the reference implementation over a larger random set', () => {
    const prices = Array.from({ length: 201 }, () => Math.round(Math.random() * 5000) + 100);
    prices.forEach((p) => add(p));
    expect(kpis().medianPriceOfListings).toBe(referenceMedian(prices));
  });
});
