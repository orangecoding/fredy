/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect } from 'vitest';

// Helper to create module under test with mocks
async function loadModuleWith({ entries = [] } = {}) {
  vi.resetModules();
  vi.doMock('../../lib/services/storage/listingsStorage.js', () => ({
    getAllEntriesFromListings: () => entries,
  }));
  return await import('../../lib/services/similarity-check/similarityCache.js');
}

describe('similarityCache', () => {
  it('initSimilarityCache builds cache from storage and enables duplicate detection', async () => {
    const entries = [
      { title: 'A', price: 1000, address: 'Main 1' },
      { title: 'B', price: 0, address: 'Zero St' },
    ];

    const { initSimilarityCache, checkAndAddEntry } = await loadModuleWith({ entries });

    // Initially, duplicates should not be detected for new data
    expect(checkAndAddEntry({ title: 'X', price: 200, address: 'Y' })).toBe(false);

    // Now initialize from storage
    initSimilarityCache();

    // Exact duplicates should be detected
    expect(checkAndAddEntry({ title: 'A', price: 1000, address: 'Main 1' })).toBe(true);
    // Ensure falsy-but-valid price 0 is preserved by hashing and detected as duplicate
    expect(checkAndAddEntry({ title: 'B', price: 0, address: 'Zero St' })).toBe(true);
  });

  it('checkAndAddEntry returns false for new entry then true for duplicate on second call', async () => {
    const { checkAndAddEntry } = await loadModuleWith();

    const first = checkAndAddEntry({ title: 'C', price: 300, address: 'Road 3' });
    const second = checkAndAddEntry({ title: 'C', price: 300, address: 'Road 3' });

    expect(first).toBe(false);
    expect(second).toBe(true);
  });

  it('hashing ignores null/undefined but preserves 0 via behavior', async () => {
    const { checkAndAddEntry } = await loadModuleWith();

    // Add baseline (null address ignored)
    const add1 = checkAndAddEntry({ title: 'T', price: 1, address: null });
    expect(add1).toBe(false);
    // Duplicate with undefined address should match
    const dup = checkAndAddEntry({ title: 'T', price: 1, address: undefined });
    expect(dup).toBe(true);

    // Now test that price 0 is preserved (not filtered out)
    const addZero = checkAndAddEntry({ title: 'Z', price: 0, address: 'Zero' });
    expect(addZero).toBe(false);
    const dupZero = checkAndAddEntry({ title: 'Z', price: 0, address: 'Zero' });
    expect(dupZero).toBe(true);
  });
});
