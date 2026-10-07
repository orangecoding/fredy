/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockFredy } from './utils.js';
import * as mockStore from './mocks/mockStore.js';
import { get as getLastNotification, reset as resetNotification } from './mocks/mockNotification.js';
import { NoNewListingsWarning } from '../lib/errors.js';

/**
 * Cross-job deduplication by exact URL.
 *
 * Two overlapping jobs find the same flat: the second run must attach to the existing row
 * instead of inserting a duplicate. Novelty is still per (job, hash) - the link match only
 * fires for hashes this job has never seen.
 */
describe('pipeline cross-job dedup by exact link', () => {
  const job = { id: 'job-b', notificationAdapter: null, specFilter: null, spatialFilter: null };
  const providerConfig = {
    url: 'http://example.com',
    normalize: (l) => l,
    filter: () => true,
    crawlFields: {},
    requiredFieldNames: [],
  };
  const cache = { checkAndAddEntry: vi.fn(() => false) };

  const listing = (over = {}) => ({
    id: 'hash-new',
    title: 'Flat',
    address: 'Street 1',
    price: 1000,
    size: 50,
    rooms: 2,
    link: 'https://example.com/expose/1',
    ...over,
  });

  beforeEach(() => {
    mockStore.setLinkMatches([]);
    resetNotification();
    // The stand-in store is module state: reset known hashes every test so seeding in one
    // test cannot leak into the next (a failed expect would otherwise skip cleanup below).
    mockStore.storeListings('job-b', 'immoscout', []);
    cache.checkAndAddEntry.mockClear();
  });

  it('flags exact link matches for attach and keeps brand-new listings unflagged', async () => {
    mockStore.setLinkMatches([
      { id: 'row-shared', job_id: 'job-a', provider: 'immoscout', link: 'https://example.com/expose/1' },
    ]);
    const Fredy = await mockFredy();
    const fredy = new Fredy(providerConfig, job, 'immoscout', cache, undefined);

    const result = fredy._findNew([listing(), listing({ id: 'hash-other', link: 'https://example.com/expose/2' })]);

    expect(result).toHaveLength(2);
    expect(result[0]._attachTo).toBe('row-shared');
    expect(result[1]._attachTo).toBeUndefined();
  });

  it('ignores link matches for hashes this job already knows', async () => {
    mockStore.setLinkMatches([
      { id: 'row-shared', job_id: 'job-a', provider: 'immoscout', link: 'https://example.com/expose/1' },
    ]);
    // Seed the mock's known hashes with the raw id string.
    mockStore.storeListings('job-b', 'immoscout', ['hash-new']);
    const Fredy = await mockFredy();
    const fredy = new Fredy(providerConfig, job, 'immoscout', cache, undefined);

    expect(() => fredy._findNew([listing()])).toThrow(NoNewListingsWarning);
    // Reset the stand-in store for the next test.
    mockStore.storeListings('job-b', 'immoscout', []);
  });

  it('attaches instead of inserting, adopts the shared id, and skips the similarity cache', async () => {
    mockStore.setLinkMatches([
      { id: 'row-shared', job_id: 'job-a', provider: 'immoscout', link: 'https://example.com/expose/1' },
    ]);
    const Fredy = await mockFredy();
    const fredy = new Fredy(providerConfig, job, 'immoscout', cache, undefined);

    const found = fredy._findNew([listing()]);
    const saved = fredy._save(found);
    const kept = fredy._filterBySimilarListings(saved);

    expect(saved[0].id).toBe('row-shared');
    expect(saved[0]._attachTo).toBeUndefined();
    expect(saved[0]._attached).toBe(true);
    expect(kept).toHaveLength(1);
    expect(cache.checkAndAddEntry).not.toHaveBeenCalled();
  });

  it('notifies the discovering job once for an attached listing', async () => {
    mockStore.setLinkMatches([
      { id: 'row-shared', job_id: 'job-a', provider: 'immoscout', link: 'https://example.com/expose/1' },
    ]);
    const Fredy = await mockFredy();
    const runningConfig = {
      ...providerConfig,
      getListings: () => Promise.resolve([listing()]),
    };
    const fredy = new Fredy(runningConfig, job, 'immoscout', cache, undefined);

    await fredy.execute();

    // The mock notification stores { serviceName, payload } where payload is the formatted batch.
    const notification = getLastNotification();
    expect(notification.serviceName).toBe('immoscout');
    expect(notification.payload.map((l) => l.link)).toContain('https://example.com/expose/1');
  });
});
