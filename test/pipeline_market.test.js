/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFredy } from './utils.js';
import * as mockStore from './mocks/mockStore.js';
import { get as getLastNotification, reset as resetNotifications } from './mocks/mockNotification.js';

// Not what these tests are about, and a network call.
vi.mock('../lib/services/listings/travelTimeSweeper.js', () => ({
  updateTravelTimesForListings: async () => {},
}));

/**
 * A listing carrying its benchmark, as the benchmark step would leave it.
 *
 * @param {string} id
 * @param {Object} [figures]
 * @param {number|null} [figures.perSqm] What a square metre of it costs.
 * @param {number|null} [figures.median] What a square metre costs around it.
 * @param {number|null} [figures.rent] What a square metre rents for around it, per month.
 * @returns {Object}
 */
function listing(id, { perSqm = 3000, median = null, rent = null } = {}) {
  return {
    id,
    title: `listing ${id}`,
    address: 'somewhere',
    price: '240000',
    link: `http://example.com/${id}`,
    price_per_sqm: perSqm,
    market_median_sqm: median,
    rent_median_sqm: rent,
  };
}

/**
 * Runs one job and answers with the ids that made it into a notification.
 *
 * @param {Object} params
 * @param {Object[]} params.listings
 * @param {string} params.providerId - Unique per test; the mock store keys its "already seen" set on it.
 * @param {Object|null} [params.marketFilter] - As stored on the job.
 * @returns {Promise<string[]>}
 */
async function notifiedIds({ listings, providerId, marketFilter = null }) {
  const Fredy = await mockFredy();
  const fredy = new Fredy(
    {
      url: 'http://example.com',
      getListings: () => Promise.resolve(listings),
      normalize: (l) => l,
      filter: () => true,
      crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
      requiredFieldNames: ['id', 'title', 'address', 'price'],
    },
    { id: `job-${providerId}`, notificationAdapter: null, specFilter: null, spatialFilter: null, marketFilter },
    providerId,
    { checkAndAddEntry: () => false },
    undefined,
  );
  try {
    await fredy.execute();
  } catch {
    // Every listing held back ends the run with NoNewListingsWarning, which is a valid outcome here.
  }
  return (getLastNotification()?.payload ?? []).map((entry) => entry.id);
}

/** Twenty percent under the area, and ten percent over it. */
const CHEAP = listing('cheap', { perSqm: 3200, median: 4000 });
const DEAR = listing('dear', { perSqm: 4400, median: 4000 });

describe("applying a job's market filter", () => {
  beforeEach(() => {
    mockStore.deletedIds.length = 0;
    resetNotifications();
  });

  it('notifies about everything when the job has no filter', async () => {
    expect(await notifiedIds({ listings: [CHEAP, DEAR], providerId: 'market-none' })).toEqual(['cheap', 'dear']);
  });

  it('leaves out the listing that is not far enough under the local median', async () => {
    expect(
      await notifiedIds({
        listings: [CHEAP, DEAR],
        providerId: 'market-notify',
        marketFilter: { action: 'notify', minBelowMarketPercent: 10 },
      }),
    ).toEqual(['cheap']);
    expect(mockStore.deletedIds).not.toContain('dear');
  });

  it('soft-deletes the listing when the job asked for that instead', async () => {
    expect(
      await notifiedIds({
        listings: [CHEAP, DEAR],
        providerId: 'market-exclude',
        marketFilter: { action: 'exclude', minBelowMarketPercent: 10 },
      }),
    ).toEqual(['cheap']);
    expect(mockStore.deletedIds).toContain('dear');
    expect(mockStore.deletedIds).not.toContain('cheap');
  });

  it('holds nothing back when the job only wants listings marked', async () => {
    expect(
      await notifiedIds({
        listings: [CHEAP, DEAR],
        providerId: 'market-mark',
        marketFilter: { action: 'mark', minBelowMarketPercent: 10 },
      }),
    ).toEqual(['cheap', 'dear']);
  });

  /** Too few neighbours is missing knowledge, not a bad price. */
  it('never holds back a listing that has no benchmark', async () => {
    expect(
      await notifiedIds({
        listings: [listing('unknown')],
        providerId: 'market-unknown',
        marketFilter: { action: 'exclude', minBelowMarketPercent: 10, minYieldPercent: 4 },
      }),
    ).toEqual(['unknown']);
    expect(mockStore.deletedIds).toHaveLength(0);
  });

  it('leaves out the purchase whose rent would not reach the yield the job asked for', async () => {
    // 3000 a square metre: 12.50 a month makes five percent a year, 7.50 makes three.
    expect(
      await notifiedIds({
        listings: [listing('earns', { rent: 12.5 }), listing('idles', { rent: 7.5 })],
        providerId: 'market-yield',
        marketFilter: { action: 'notify', minYieldPercent: 4 },
      }),
    ).toEqual(['earns']);
  });
});
