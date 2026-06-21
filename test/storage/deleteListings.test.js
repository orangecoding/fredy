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
    it('hard delete fetches affected rows, DELETEs them and evicts each from the cache', () => {
      sqliteMock.__queryHandler = () => [
        { title: 'A', address: 'Main 1', price: 1000 },
        { title: 'B', address: 'Zero St', price: 0 },
      ];

      listingsStorage.deleteListingsByJobId('job-1', true);

      // A DELETE (not a soft-delete UPDATE) must run
      expect(calls.execute).toHaveLength(1);
      expect(calls.execute[0].sql).toMatch(/DELETE FROM listings/);
      expect(calls.execute[0].sql).not.toMatch(/manually_deleted/);

      // Each removed row must be evicted from the similarity cache
      expect(removeEntry).toHaveBeenCalledTimes(2);
      expect(removeEntry).toHaveBeenCalledWith({ title: 'A', address: 'Main 1', price: 1000 });
      expect(removeEntry).toHaveBeenCalledWith({ title: 'B', address: 'Zero St', price: 0 });
    });

    it('soft delete marks rows and does NOT touch the similarity cache', () => {
      listingsStorage.deleteListingsByJobId('job-1', false);

      expect(calls.execute).toHaveLength(1);
      expect(calls.execute[0].sql).toMatch(/UPDATE listings\s+SET manually_deleted = 1/);
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
      sqliteMock.__queryHandler = () => [{ title: 'C', address: 'Road 3', price: 300 }];

      listingsStorage.deleteListingsById(['id-1', 'id-2'], true);

      expect(calls.execute).toHaveLength(1);
      expect(calls.execute[0].sql).toMatch(/DELETE FROM listings/);
      expect(calls.execute[0].sql).not.toMatch(/manually_deleted/);

      expect(removeEntry).toHaveBeenCalledTimes(1);
      expect(removeEntry).toHaveBeenCalledWith({ title: 'C', address: 'Road 3', price: 300 });
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
