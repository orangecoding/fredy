/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The delete runs plain SQL, so the test backs the mocked SqliteConnection with a real
 * in-memory database instead of asserting on statement strings.
 */
let db;

vi.mock('../../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    query: (sql, params = {}) => db.prepare(sql).all(params),
    withTransaction: (callback) => db.transaction((cb) => cb(db))(callback),
  },
}));
vi.mock('../../../lib/services/similarity-check/similarityCache.js', () => ({
  removeEntry: () => {},
  isListingKnownAndAddIfNot: () => false,
  initSimilarityCache: () => {},
  startSimilarityCacheReloader: () => {},
  checkAndAddEntry: () => false,
}));

const addListing = (id, jobId, isActive) =>
  db
    .prepare(`INSERT INTO listings (id, job_id, is_active, manually_deleted) VALUES (?, ?, ?, 0)`)
    .run(id, jobId, isActive);

const remainingIds = () =>
  db
    .prepare(`SELECT id FROM listings ORDER BY id`)
    .all()
    .map((row) => row.id);

describe('listingsStorage.deleteInactiveListingsByJobId', () => {
  let deleteInactiveListingsByJobId;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id               TEXT PRIMARY KEY,
        job_id           TEXT,
        title            TEXT,
        address          TEXT,
        price            REAL,
        is_active        INTEGER,
        manually_deleted INTEGER DEFAULT 0
      );
    `);
    ({ deleteInactiveListingsByJobId } = await import('../../../lib/services/storage/listingsStorage.js'));
  });

  afterEach(() => db.close());

  it('hard deletes only the inactive listings of the given job', () => {
    addListing('a', 'demo-job', 0);
    addListing('b', 'demo-job', 1);
    addListing('c', 'demo-job', null);
    addListing('d', 'other-job', 0);

    deleteInactiveListingsByJobId('demo-job');

    expect(remainingIds()).toEqual(['b', 'c', 'd']);
  });

  it('is a no-op without a job id', () => {
    addListing('a', 'demo-job', 0);

    deleteInactiveListingsByJobId(null);

    expect(remainingIds()).toEqual(['a']);
  });
});
