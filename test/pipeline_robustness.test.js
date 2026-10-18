/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockFredy } from './utils.js';
import * as mockStore from './mocks/mockStore.js';

const PROVIDER = 'robust-provider';

/**
 * One pass of the pipeline over a fixed page of listings.
 *
 * @param {Object[]} page What the provider returns.
 * @param {Object} [options]
 * @param {(listing: Object) => Promise<Object>} [options.fetchDetails]
 * @param {Object|null} [options.specFilter]
 * @returns {Promise<Object[]>} The listings the pass stored.
 */
const runOnePass = async (page, { fetchDetails, specFilter = null } = {}) => {
  const Fredy = await mockFredy();
  const providerConfig = {
    url: 'http://example.com',
    getListings: () => Promise.resolve(page.map((listing) => ({ ...listing }))),
    normalize: (listing) => listing,
    filter: () => true,
    requiredFieldNames: ['id', 'title', 'link'],
    ...(fetchDetails ? { fetchDetails } : {}),
  };
  const fredy = new Fredy(
    providerConfig,
    { id: 'job-1', notificationAdapter: null, specFilter },
    PROVIDER,
    { checkAndAddEntry: () => false },
    undefined,
    { maxDetailFetches: 10 },
  );
  await fredy.execute();
  return mockStore.getKnownListingHashesForJobAndProvider('job-1', PROVIDER);
};

const listing = (id, extra = {}) => ({ id, title: `t${id}`, link: `http://example.com/${id}`, ...extra });

describe('pipeline robustness', () => {
  beforeEach(() => {
    mockStore.resetListings();
    mockStore.setUserSettings({ provider_details: [PROVIDER] });
    mockStore.setGeocodeResult(null);
  });

  afterEach(() => {
    mockStore.setUserSettings(null);
  });

  // A connection reset on one detail page used to send the whole run to the error handler, and every
  // new listing of that run was neither stored nor reported.
  it('keeps a listing whose detail page failed, without its details', async () => {
    const stored = await runOnePass([listing('1'), listing('2'), listing('3')], {
      fetchDetails: async (item) => {
        if (item.id === '2') throw new Error('ECONNRESET');
        return { ...item, description: 'details' };
      },
    });
    expect(stored.map((item) => item.id)).toEqual(['1', '2', '3']);
    expect(stored.find((item) => item.id === '2').description).toBeUndefined();
  });

  // The card had no size, so the first spec pass let it through; the detail page then said 35 m².
  it('applies the spec filter again to what the detail pages added', async () => {
    const stored = await runOnePass([listing('1'), listing('2')], {
      specFilter: { minSize: 60 },
      fetchDetails: async (item) => ({ ...item, size: item.id === '1' ? 35 : 80 }),
    });
    expect(stored.map((item) => item.id)).toEqual(['2']);
  });

  // Two entries with one hash were stored as one row, which the similarity check then soft-deleted
  // as a duplicate of itself.
  it('takes each hash once per run, the first one', async () => {
    const stored = await runOnePass([listing('1', { title: 'first' }), listing('1', { title: 'again' }), listing('2')]);
    expect(stored.map((item) => item.id)).toEqual(['1', '2']);
    expect(stored[0].title).toBe('first');
  });
});
