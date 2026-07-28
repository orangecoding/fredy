/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * Callers hand these functions unbounded id lists - the nightly alive-checker passes every listing
 * that went offline. A single `IN (?, ?, ...)` over that list exceeds SQLite's bound-parameter
 * limit and throws, losing the whole batch. These run against a real database so the limit is the
 * real one rather than a mock's opinion.
 */
describe('listing id batches larger than the SQLite parameter limit', () => {
  let db;
  let listingsStorage;

  /** Comfortably above SQLITE_MAX_VARIABLE_NUMBER in older builds (999) and a multiple of chunks. */
  const BATCH = 2500;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        hash TEXT,
        provider TEXT,
        job_id TEXT,
        title TEXT,
        address TEXT,
        price REAL,
        is_active INTEGER DEFAULT 1,
        manually_deleted INTEGER DEFAULT 0
      );
    `);
    const insert = db.prepare(
      'INSERT INTO listings (id, hash, job_id, title, address, price) VALUES (?, ?, ?, ?, ?, ?)',
    );
    db.transaction(() => {
      for (let i = 0; i < BATCH; i++) insert.run(`id-${i}`, `hash-${i}`, 'job-1', `Flat ${i}`, `Street ${i}`, 1000 + i);
    })();

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

  const allIds = () => Array.from({ length: BATCH }, (_, i) => `id-${i}`);
  const countWhere = (clause) => db.prepare(`SELECT COUNT(*) AS c FROM listings WHERE ${clause}`).get().c;

  it('deactivates every listing in one oversized batch', () => {
    listingsStorage.deactivateListings(allIds());
    expect(countWhere('is_active = 0')).toBe(BATCH);
  });

  it('soft deletes every listing in one oversized batch', () => {
    listingsStorage.deleteListingsById(allIds());
    expect(countWhere('manually_deleted = 1')).toBe(BATCH);
  });

  it('hard deletes every listing in one oversized batch', () => {
    listingsStorage.deleteListingsById(allIds(), true);
    expect(countWhere('1 = 1')).toBe(0);
  });

  it('restores every listing in one oversized batch', () => {
    listingsStorage.deleteListingsById(allIds());
    listingsStorage.restoreListingsById(allIds());
    expect(countWhere('manually_deleted = 0')).toBe(BATCH);
  });

  it('is all-or-nothing: a failure inside the batch leaves nothing half-applied', () => {
    const ids = allIds();
    // Force a failure partway through by dropping the column the update writes.
    const original = db.prepare.bind(db);
    let calls = 0;
    db.prepare = (sql) => {
      calls += 1;
      if (calls > 2 && /SET is_active = 0/.test(sql)) throw new Error('boom');
      return original(sql);
    };
    expect(() => listingsStorage.deactivateListings(ids)).toThrow(/boom/);
    db.prepare = original;
    expect(countWhere('is_active = 0')).toBe(0);
  });

  it('still handles small batches and empty input', () => {
    listingsStorage.deactivateListings(['id-0', 'id-1']);
    expect(countWhere('is_active = 0')).toBe(2);
    expect(listingsStorage.deleteListingsById([])).toBeUndefined();
    expect(listingsStorage.restoreListingsById([])).toBeUndefined();
  });
});
