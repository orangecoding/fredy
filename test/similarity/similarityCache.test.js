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
      { job_id: 'job-1', title: 'A', price: 1000, address: 'Main 1' },
      { job_id: 'job-1', title: 'B', price: 0, address: 'Zero St' },
    ];

    const { initSimilarityCache, checkAndAddEntry } = await loadModuleWith({ entries });

    // Initially, duplicates should not be detected for new data
    expect(checkAndAddEntry({ jobId: 'job-1', title: 'X', price: 200, address: 'Y' })).toBe(false);

    // Now initialize from storage
    initSimilarityCache();

    // Exact duplicates should be detected
    expect(checkAndAddEntry({ jobId: 'job-1', title: 'A', price: 1000, address: 'Main 1' })).toBe(true);
    expect(checkAndAddEntry({ jobId: 'job-2', title: 'A', price: 1000, address: 'Main 1' })).toBe(false);
    // Ensure falsy-but-valid price 0 is preserved by hashing and detected as duplicate
    expect(checkAndAddEntry({ jobId: 'job-1', title: 'B', price: 0, address: 'Zero St' })).toBe(true);
  });

  it('checkAndAddEntry returns false for new entry then true for duplicate on second call', async () => {
    const { checkAndAddEntry } = await loadModuleWith();

    const first = checkAndAddEntry({ jobId: 'job-1', title: 'C', price: 300, address: 'Road 3' });
    const second = checkAndAddEntry({ jobId: 'job-1', title: 'C', price: 300, address: 'Road 3' });

    expect(first).toBe(false);
    expect(second).toBe(true);
  });

  it('hashing ignores null/undefined but preserves 0 via behavior', async () => {
    const { checkAndAddEntry } = await loadModuleWith();

    // Add baseline (null address ignored)
    const add1 = checkAndAddEntry({ jobId: 'job-1', title: 'T', price: 1, address: null });
    expect(add1).toBe(false);
    // Duplicate with undefined address should match
    const dup = checkAndAddEntry({ jobId: 'job-1', title: 'T', price: 1, address: undefined });
    expect(dup).toBe(true);

    // Now test that price 0 is preserved (not filtered out)
    const addZero = checkAndAddEntry({ jobId: 'job-1', title: 'Z', price: 0, address: 'Zero' });
    expect(addZero).toBe(false);
    const dupZero = checkAndAddEntry({ jobId: 'job-1', title: 'Z', price: 0, address: 'Zero' });
    expect(dupZero).toBe(true);
  });

  it('removeEntry evicts a known entry so it is no longer detected as a duplicate', async () => {
    const { checkAndAddEntry, removeEntry } = await loadModuleWith();

    // Seed the cache with an entry
    expect(checkAndAddEntry({ jobId: 'job-1', title: 'A', price: 1000, address: 'Main 1' })).toBe(false);
    expect(checkAndAddEntry({ jobId: 'job-1', title: 'A', price: 1000, address: 'Main 1' })).toBe(true);

    // Evict it
    expect(removeEntry({ jobId: 'job-1', title: 'A', price: 1000, address: 'Main 1' })).toBe(true);

    // After eviction it must be treated as new again (this is the hard-delete fix)
    expect(checkAndAddEntry({ jobId: 'job-1', title: 'A', price: 1000, address: 'Main 1' })).toBe(false);
  });

  it('removeEntry returns false when the entry is not present', async () => {
    const { removeEntry } = await loadModuleWith();

    expect(removeEntry({ jobId: 'job-1', title: 'Nope', price: 1, address: 'Nowhere' })).toBe(false);
  });

  it('removeEntry uses the same hashing rules (null/undefined ignored, 0 preserved)', async () => {
    const { checkAndAddEntry, removeEntry } = await loadModuleWith();

    // Seed with a null address and price 0
    expect(checkAndAddEntry({ jobId: 'job-1', title: 'Z', price: 0, address: null })).toBe(false);

    // Removing with undefined address (same hash) should evict it
    expect(removeEntry({ jobId: 'job-1', title: 'Z', price: 0, address: undefined })).toBe(true);
    expect(checkAndAddEntry({ jobId: 'job-1', title: 'Z', price: 0, address: null })).toBe(false);
  });

  it('keeps similarity detection isolated between jobs', async () => {
    const { checkAndAddEntry } = await loadModuleWith();
    const listing = { title: 'A', price: 1000, address: 'Main 1' };

    expect(checkAndAddEntry({ jobId: 'job-1', ...listing })).toBe(false);
    expect(checkAndAddEntry({ jobId: 'job-1', ...listing })).toBe(true);
    expect(checkAndAddEntry({ jobId: 'job-2', ...listing })).toBe(false);
  });

  it('normalizes parenthesized address suffixes consistently with storage', async () => {
    const { checkAndAddEntry } = await loadModuleWith();

    expect(checkAndAddEntry({ jobId: 'job-1', title: 'A', price: 1000, address: 'Main 1 (Mitte)' })).toBe(false);
    expect(checkAndAddEntry({ jobId: 'job-1', title: 'A', price: 1000, address: 'Main 1' })).toBe(true);
  });

  it('removes only the matching job entry', async () => {
    const { checkAndAddEntry, removeEntry } = await loadModuleWith();
    const listing = { title: 'A', price: 1000, address: 'Main 1' };

    expect(checkAndAddEntry({ jobId: 'job-1', ...listing })).toBe(false);
    expect(checkAndAddEntry({ jobId: 'job-2', ...listing })).toBe(false);
    expect(removeEntry({ jobId: 'job-1', ...listing })).toBe(true);

    expect(checkAndAddEntry({ jobId: 'job-1', ...listing })).toBe(false);
    expect(checkAndAddEntry({ jobId: 'job-2', ...listing })).toBe(true);
  });
});
