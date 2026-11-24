/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * Sorting the listings page by price per square metre, and where the listings without one end up.
 *
 * Against a real database because the part worth testing is SQLite's own ordering: it puts NULL
 * first when ascending, so the cheapest-first view used to open with every "price on request"
 * listing. A mocked connection would only ever see the statement string.
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

describe('queryListings sort order against real SQLite', () => {
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
        price_per_sqm REAL,
        title TEXT,
        status TEXT,
        distances TEXT,
        created_at INTEGER DEFAULT 0,
        published_at INTEGER,
        is_active INTEGER DEFAULT 1,
        manually_deleted INTEGER DEFAULT 0
      );
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
      CREATE TABLE listing_attachments (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        filename TEXT,
        mime_type TEXT,
        size INTEGER,
        content BLOB,
        created_at INTEGER
      );
      CREATE TABLE listing_travel_times (
        listing_id TEXT NOT NULL,
        label TEXT NOT NULL,
        transit_minutes INTEGER,
        car_minutes INTEGER,
        bike_minutes INTEGER,
        walk_minutes INTEGER,
        estimate_mode TEXT,
        is_estimate INTEGER NOT NULL DEFAULT 1,
        reference_time INTEGER,
        computed_at INTEGER,
        PRIMARY KEY (listing_id, label)
      );
    `);
    db.prepare(`INSERT INTO jobs (id, user_id, name, deal_type) VALUES ('job-1', ?, 'A job', 'buy')`).run(USER);

    const insert = db.prepare(
      `INSERT INTO listings (id, job_id, price, size, price_per_sqm, title) VALUES (?, 'job-1', ?, ?, ?, ?)`,
    );
    // A big cheap house is the cheapest per square metre and still not the cheapest in total.
    insert.run('big-house', 360000, 180, 2000, 'big-house');
    insert.run('small-flat', 180000, 45, 4000, 'small-flat');
    insert.run('middle', 240000, 80, 3000, 'middle');
    insert.run('on-request', null, 70, null, 'on-request');
    insert.run('no-size', 200000, null, null, 'no-size');

    vi.resetModules();
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  /**
   * @param {Object} params
   * @returns {string[]}
   */
  const idsFrom = (params) =>
    listingsStorage.queryListings({ userId: USER, pageSize: 100, ...params }).result.map((row) => row.id);

  it('orders by price per square metre, cheapest first, and puts the listings without one last', () => {
    const ids = idsFrom({ sortField: 'price_per_sqm', sortDir: 'asc' });

    expect(ids.slice(0, 3)).toEqual(['big-house', 'middle', 'small-flat']);
    expect(ids.slice(3).sort()).toEqual(['no-size', 'on-request']);
  });

  it('keeps the listings without a price per square metre last when descending', () => {
    const ids = idsFrom({ sortField: 'price_per_sqm', sortDir: 'desc' });

    expect(ids.slice(0, 3)).toEqual(['small-flat', 'middle', 'big-house']);
    expect(ids.slice(3).sort()).toEqual(['no-size', 'on-request']);
  });

  it('puts a listing without a price after the priced ones when sorting by price ascending', () => {
    const ids = idsFrom({ sortField: 'price', sortDir: 'asc' });

    expect(ids).toEqual(['small-flat', 'no-size', 'middle', 'big-house', 'on-request']);
  });
});
