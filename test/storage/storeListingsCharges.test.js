/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

/**
 * A rent's basis - with the charges or without, and what they come to - is stored with the rent,
 * so the similarity cache still knows it after its hourly reload from the table.
 */
describe('storeListings, the basis of a rent', () => {
  let db;
  let listingsStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        hash TEXT,
        provider TEXT,
        job_id TEXT,
        price REAL,
        charges_included INTEGER,
        charges REAL,
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
        price_per_sqm REAL,
        UNIQUE (job_id, hash)
      );
    `);

    vi.resetModules();
    vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => (params == null ? db.prepare(sql).all() : db.prepare(sql).all(params)),
        execute: (sql, params) => db.prepare(sql).run(params),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    vi.doMock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => {
    db.close();
  });

  const listing = (hash, overrides = {}) => ({
    id: hash,
    price: 1140,
    size: 37,
    rooms: 2,
    title: `Flat ${hash}`,
    image: null,
    description: 'nice',
    address: '75012 Paris',
    link: `https://example.com/${hash}`,
    ...overrides,
  });

  const stored = (hash) => db.prepare('SELECT charges_included, charges FROM listings WHERE hash = ?').get(hash);

  it('stores a rent without the charges, and the charges it was stated with', () => {
    listingsStorage.storeListings('job-1', 'leboncoin', [listing('net', { chargesIncluded: false, charges: 50 })]);
    expect(stored('net')).toEqual({ charges_included: 0, charges: 50 });
  });

  it('stores a rent with the charges in it', () => {
    listingsStorage.storeListings('job-1', 'seloger', [listing('gross', { price: 1190, chargesIncluded: true })]);
    expect(stored('gross')).toEqual({ charges_included: 1, charges: null });
  });

  it('stores an unknown basis as unknown', () => {
    listingsStorage.storeListings('job-1', 'immoscout', [listing('unknown')]);
    expect(stored('unknown')).toEqual({ charges_included: null, charges: null });
  });

  it('hands the basis to the similarity cache when it reloads', () => {
    listingsStorage.storeListings('job-1', 'leboncoin', [listing('net', { chargesIncluded: false, charges: 50 })]);
    expect(listingsStorage.getAllEntriesFromListings()).toEqual([
      expect.objectContaining({ provider: 'leboncoin', price: 1140, charges_included: 0, charges: 50 }),
    ]);
  });
});
