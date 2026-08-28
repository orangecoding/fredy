/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * `storeListings` writes the DB primary key back onto each listing so the rest of the pipeline can
 * address the stored row - distance updates, and the spec/area/similarity filters, which delete by
 * id. The insert carries `ON CONFLICT DO NOTHING`, so it does not always write a row; when it did
 * not, the generated id used to be assigned anyway and every later step silently addressed a row
 * that does not exist.
 */
describe('storeListings id propagation', () => {
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
        is_active INTEGER,
        manually_deleted INTEGER DEFAULT 0,
        latitude REAL,
        longitude REAL,
        distances TEXT,
        notes TEXT,
        status TEXT,
        UNIQUE (job_id, hash)
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

  afterEach(() => {
    db.close();
  });

  const listing = (hash, overrides = {}) => ({
    id: hash,
    price: 1000,
    size: 60,
    rooms: 2,
    title: `Flat ${hash}`,
    image: null,
    description: 'nice',
    address: 'Hauptstrasse 1 (Innenstadt)',
    link: `https://example.com/${hash}`,
    ...overrides,
  });

  const rowExists = (id) => db.prepare('SELECT 1 FROM listings WHERE id = ?').get(id) != null;

  it('gives a freshly inserted listing the id of its row', () => {
    const listings = [listing('hash-1')];
    listingsStorage.storeListings('job-1', 'immowelt', listings);

    expect(rowExists(listings[0].id)).toBe(true);
  });

  it('points a duplicate inside one batch at the row that was actually written', () => {
    const listings = [listing('same-hash'), listing('same-hash')];
    listingsStorage.storeListings('job-1', 'immowelt', listings);

    expect(db.prepare('SELECT COUNT(*) AS c FROM listings').get().c).toBe(1);
    // Both entries must address the one existing row, not a phantom id.
    expect(rowExists(listings[0].id)).toBe(true);
    expect(rowExists(listings[1].id)).toBe(true);
    expect(listings[0].id).toBe(listings[1].id);
  });

  it('points a listing already stored by another provider of the same job at the existing row', () => {
    const first = [listing('shared-hash')];
    listingsStorage.storeListings('job-1', 'immowelt', first);
    const storedId = first[0].id;

    const second = [listing('shared-hash')];
    listingsStorage.storeListings('job-1', 'immoscout', second);

    expect(db.prepare('SELECT COUNT(*) AS c FROM listings').get().c).toBe(1);
    expect(second[0].id).toBe(storedId);
    expect(rowExists(second[0].id)).toBe(true);
  });

  it('lets a downstream delete actually remove the row after a conflict', () => {
    listingsStorage.storeListings('job-1', 'immowelt', [listing('dup')]);
    const second = [listing('dup')];
    listingsStorage.storeListings('job-1', 'immoscout', second);

    // This is what _filterBySpecs/_filterByArea do with the ids they were handed.
    listingsStorage.deleteListingsById([second[0].id]);

    expect(db.prepare('SELECT manually_deleted FROM listings').get().manually_deleted).toBe(1);
  });

  it('keeps the same hash separate across different jobs', () => {
    const forJobOne = [listing('hash-x')];
    const forJobTwo = [listing('hash-x')];
    listingsStorage.storeListings('job-1', 'immowelt', forJobOne);
    listingsStorage.storeListings('job-2', 'immowelt', forJobTwo);

    expect(db.prepare('SELECT COUNT(*) AS c FROM listings').get().c).toBe(2);
    expect(forJobOne[0].id).not.toBe(forJobTwo[0].id);
  });

  it('strips parenthesised address suffixes', () => {
    const listings = [listing('hash-addr')];
    listingsStorage.storeListings('job-1', 'immowelt', listings);
    expect(db.prepare('SELECT address FROM listings').get().address).toBe('Hauptstrasse 1');
  });
});
