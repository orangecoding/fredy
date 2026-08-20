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

  describe('cross-provider fingerprint matching', () => {
    const BROKER_COPY =
      'Diese ansprechende Wohnung befindet sich im zweiten Obergeschoss eines gepflegten ' +
      'Mehrfamilienhauses und ueberzeugt durch ihren durchdachten Grundriss. Der Balkon nach ' +
      'Sueden laedt zum Verweilen ein. Die Kueche ist voll ausgestattet.';

    const scout = {
      jobId: 'job-1',
      provider: 'immoscout',
      title: 'Helle 3-Zimmer-Wohnung mit Balkon in Stadtamhof',
      address: 'Stadtamhof, Regensburg',
      price: 1450,
      size: 78,
      rooms: 3,
      description: BROKER_COPY,
    };

    const welt = {
      jobId: 'job-1',
      provider: 'immowelt',
      title: '3-Zimmer-Wohnung mit Balkon, Regensburg-Stadtamhof',
      address: '93059 Stadtamhof, Regensburg',
      price: 1180,
      size: 78,
      rooms: 3,
      description: BROKER_COPY,
    };

    it('catches the same flat arriving from a second provider in the same run', async () => {
      const { checkAndAddEntry } = await loadModuleWith();

      expect(checkAndAddEntry(scout)).toBe(false);
      expect(checkAndAddEntry(welt)).toBe(true);
    });

    it('catches it again after a restart, hydrating from stored rows', async () => {
      const entries = [
        {
          job_id: 'job-1',
          provider: 'immoscout',
          title: scout.title,
          address: scout.address,
          price: scout.price,
          size: scout.size,
          rooms: scout.rooms,
          description: scout.description,
        },
      ];
      const { initSimilarityCache, checkAndAddEntry } = await loadModuleWith({ entries });
      initSimilarityCache();

      expect(checkAndAddEntry(welt)).toBe(true);
    });

    it('does not add the duplicate, so the first copy stays the known one', async () => {
      const { checkAndAddEntry, removeEntry } = await loadModuleWith();

      checkAndAddEntry(scout);
      checkAndAddEntry(welt);

      // The Immowelt copy was never cached, only recognised.
      expect(removeEntry(welt)).toBe(false);
      expect(removeEntry(scout)).toBe(true);
      expect(checkAndAddEntry(welt)).toBe(false);
    });

    it('leaves listings from the same provider to the exact tier', async () => {
      const { checkAndAddEntry } = await loadModuleWith();
      const twin = { ...scout, title: `${scout.title} - Whg. 4` };

      expect(checkAndAddEntry(scout)).toBe(false);
      expect(checkAndAddEntry(twin)).toBe(false);
    });

    it('keeps a genuinely different flat in the same district', async () => {
      const { checkAndAddEntry } = await loadModuleWith();
      const other = {
        ...welt,
        title: 'Dachgeschoss-Maisonette mit Galerie',
        price: 1700,
        description: 'Ein voellig anderes Objekt mit Galerie und Dachterrasse ueber zwei Ebenen.',
      };

      expect(checkAndAddEntry(scout)).toBe(false);
      expect(checkAndAddEntry(other)).toBe(false);
    });

    it('still isolates jobs', async () => {
      const { checkAndAddEntry } = await loadModuleWith();

      expect(checkAndAddEntry(scout)).toBe(false);
      expect(checkAndAddEntry({ ...welt, jobId: 'job-2' })).toBe(false);
    });

    it('counts listings that share a content hash, so removing one keeps the other', async () => {
      const { initSimilarityCache, checkAndAddEntry } = await loadModuleWith({
        entries: [
          { job_id: 'job-1', title: 'A', address: 'Main 1', price: 1000 },
          { job_id: 'job-1', title: 'A', address: 'Main 1', price: 1000 },
        ],
      });
      initSimilarityCache();

      const { removeEntry } = await import('../../lib/services/similarity-check/similarityCache.js');
      expect(removeEntry({ jobId: 'job-1', title: 'A', address: 'Main 1', price: 1000 })).toBe(true);
      // One stored listing still carries that hash, so it must stay a duplicate.
      expect(checkAndAddEntry({ jobId: 'job-1', title: 'A', address: 'Main 1', price: 1000 })).toBe(true);
    });
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
