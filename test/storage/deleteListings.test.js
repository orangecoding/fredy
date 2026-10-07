/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock SqliteConnection so we can drive the rows returned for the "fetch before
// delete" query and assert which SQL the storage layer runs.
const calls = {
  execute: [],
  query: [],
};

const sqliteMock = {
  execute: (sql, params) => {
    calls.execute.push({ sql, params });
    return { changes: 1 };
  },
  query: (sql, params) => {
    calls.query.push({ sql, params });
    if (sqliteMock.__queryHandler) return sqliteMock.__queryHandler(sql, params);
    return [];
  },
  // Batch updates run chunked inside a transaction so an unbounded id list cannot exceed
  // SQLite's bound-parameter limit. Statements prepared on the transaction's db handle are
  // recorded into the same `calls.execute` log, so the assertions below stay about the SQL.
  withTransaction: (callback) =>
    callback({
      prepare: (sql) => ({
        run: (params) => {
          calls.execute.push({ sql, params });
          return { changes: 1 };
        },
      }),
    }),
  __queryHandler: null,
};

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: sqliteMock,
}));

// Spy on the similarity cache so we can assert that hard deletes evict the
// removed listings (the fix for the "hard-deleted listings vanish" bug).
const removeEntry = vi.fn();
vi.mock('../../lib/services/similarity-check/similarityCache.js', () => ({
  removeEntry: (...args) => removeEntry(...args),
}));

describe('listingsStorage hard delete evicts the similarity cache', () => {
  let listingsStorage;

  beforeEach(async () => {
    calls.execute.length = 0;
    calls.query.length = 0;
    sqliteMock.__queryHandler = null;
    removeEntry.mockClear();
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  describe('deleteListingsByJobId', () => {
    // The mock answers the two SELECT shapes the detach-then-cleanup flow runs:
    // the orphan-id lookup and the hardDeleteAndEvict row fetch.
    let orphanIds;
    let removedRows;
    beforeEach(() => {
      orphanIds = [{ id: 'a' }, { id: 'b' }];
      removedRows = [
        {
          id: 'a',
          job_id: 'job-1',
          provider: 'immoscout',
          title: 'A',
          address: 'Main 1',
          price: 1000,
          size: 60,
          rooms: 2,
        },
        {
          id: 'b',
          job_id: 'job-1',
          provider: 'immowelt',
          title: 'B',
          address: 'Zero St',
          price: 0,
          size: 70,
          rooms: 3,
        },
      ];
      sqliteMock.__queryHandler = (sql) => {
        if (/NOT EXISTS \(SELECT 1 FROM listing_jobs/.test(sql)) return orphanIds;
        return removedRows;
      };
    });

    it('detaches first, then hard deletes only orphaned rows and evicts each from the cache', () => {
      listingsStorage.deleteListingsByJobId('job-1', true);

      // Detach first: the job's attachments go regardless of what survives.
      expect(calls.execute[0].sql).toMatch(/DELETE FROM listing_jobs WHERE job_id = @jobId/);
      expect(calls.execute[0].params).toMatchObject({ jobId: 'job-1' });
      // A DELETE of the orphaned rows (not a soft-delete UPDATE) must run.
      const listingDeletes = calls.execute.filter((c) => /DELETE FROM listings/.test(c.sql));
      expect(listingDeletes).toHaveLength(1);
      expect(listingDeletes[0].sql).not.toMatch(/manually_deleted/);

      // Each removed row must be evicted from the similarity cache.
      expect(removeEntry).toHaveBeenCalledTimes(2);
      expect(removeEntry).toHaveBeenCalledWith({
        jobId: 'job-1',
        provider: 'immoscout',
        title: 'A',
        address: 'Main 1',
        price: 1000,
        size: 60,
        rooms: 2,
      });
      expect(removeEntry).toHaveBeenCalledWith({
        jobId: 'job-1',
        provider: 'immowelt',
        title: 'B',
        address: 'Zero St',
        price: 0,
        size: 70,
        rooms: 3,
      });
    });

    it('leaves rows other jobs still reference alone, detaching them only', () => {
      orphanIds = [];

      const result = listingsStorage.deleteListingsByJobId('job-1', true);

      expect(result).toEqual({ changes: 0 });
      expect(calls.execute).toHaveLength(1);
      expect(calls.execute[0].sql).toMatch(/DELETE FROM listing_jobs/);
      expect(calls.execute.some((c) => /DELETE FROM listings/.test(c.sql))).toBe(false);
      expect(removeEntry).not.toHaveBeenCalled();
    });

    it('soft delete detaches, then marks only orphaned rows, and does NOT touch the similarity cache', () => {
      listingsStorage.deleteListingsByJobId('job-1', false);

      expect(calls.execute[0].sql).toMatch(/DELETE FROM listing_jobs/);
      const softDeletes = calls.execute.filter((c) => /SET manually_deleted = 1/.test(c.sql));
      expect(softDeletes).toHaveLength(1);
      expect(removeEntry).not.toHaveBeenCalled();
    });

    it('does not evict cache entries for already hidden duplicates', () => {
      removedRows = [{ id: 'a', job_id: 'job-1', title: 'A', address: 'Main 1', price: 1000, manually_deleted: 1 }];

      listingsStorage.deleteListingsByJobId('job-1', true);

      expect(calls.execute.some((c) => /DELETE FROM listings/.test(c.sql))).toBe(true);
      expect(removeEntry).not.toHaveBeenCalled();
    });

    it('is a no-op without a jobId', () => {
      listingsStorage.deleteListingsByJobId(undefined, true);
      expect(calls.execute).toHaveLength(0);
      expect(removeEntry).not.toHaveBeenCalled();
    });
  });

  describe('deleteListingsById', () => {
    it('hard delete fetches affected rows, DELETEs them and evicts each from the cache', () => {
      sqliteMock.__queryHandler = () => [
        { job_id: 'job-1', provider: 'kleinanzeigen', title: 'C', address: 'Road 3', price: 300, size: 45, rooms: 1.5 },
      ];

      listingsStorage.deleteListingsById(['id-1', 'id-2'], true);

      // Row delete plus join-table cleanup (an explicit row delete kills every attachment).
      expect(calls.execute).toHaveLength(2);
      expect(calls.execute[0].sql).toMatch(/DELETE FROM listings/);
      expect(calls.execute[0].sql).not.toMatch(/manually_deleted/);
      expect(calls.execute[1].sql).toMatch(/DELETE FROM listing_jobs/);

      expect(removeEntry).toHaveBeenCalledTimes(1);
      expect(removeEntry).toHaveBeenCalledWith({
        jobId: 'job-1',
        provider: 'kleinanzeigen',
        title: 'C',
        address: 'Road 3',
        price: 300,
        size: 45,
        rooms: 1.5,
      });
    });

    it('soft delete marks rows and does NOT touch the similarity cache', () => {
      listingsStorage.deleteListingsById(['id-1'], false);

      expect(calls.execute).toHaveLength(1);
      expect(calls.execute[0].sql).toMatch(/UPDATE listings\s+SET manually_deleted = 1/);
      expect(removeEntry).not.toHaveBeenCalled();
    });

    it('is a no-op for an empty id list', () => {
      listingsStorage.deleteListingsById([], true);
      expect(calls.execute).toHaveLength(0);
      expect(removeEntry).not.toHaveBeenCalled();
    });
  });
});
