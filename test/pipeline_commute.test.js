/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFredy } from './utils.js';
import * as mockStore from './mocks/mockStore.js';
import { get as getLastNotification, reset as resetNotifications } from './mocks/mockNotification.js';

// The sweep is a network call and is not what these tests are about: they check what the pipeline
// does with travel times, and the listings arrive carrying their own.
vi.mock('../lib/services/listings/travelTimeSweeper.js', () => ({
  updateTravelTimesForListings: async () => {},
}));

const HOME = { lat: 52.52, lng: 13.4 };

/** The saved address every test measures from. What is too far is the job's to say. */
const WORK = { label: 'Work', address: 'office', coords: HOME, mode: 'transit' };

/**
 * A listing with a public transport commute already measured, as the sweep would leave it.
 *
 * @param {string} id
 * @param {number|null} minutes - `null` for a listing nothing is known about yet.
 * @returns {Object}
 */
function listing(id, minutes) {
  return {
    id,
    title: `listing ${id}`,
    address: 'somewhere',
    price: '900',
    link: `http://example.com/${id}`,
    travelTimes:
      minutes == null ? [] : [{ label: 'Work', mode: 'transit', estimate: true, transit: { minutes, transfers: 1 } }],
  };
}

/**
 * Runs one job and answers with the ids that made it into a notification.
 *
 * @param {Object} params
 * @param {Object[]} params.listings
 * @param {string} params.providerId - Unique per test; the mock store keys its "already seen" set on it.
 * @param {Object|null} [params.commuteFilter] - As stored on the job.
 * @returns {Promise<string[]>}
 */
async function notifiedIds({ listings, providerId, commuteFilter = null }) {
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
    { id: `job-${providerId}`, notificationAdapter: null, specFilter: null, spatialFilter: null, commuteFilter },
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

describe("applying a job's commute filter", () => {
  beforeEach(() => {
    mockStore.deletedIds.length = 0;
    resetNotifications();
    mockStore.setUserSettings({ home_addresses: [WORK] });
  });

  it('notifies about everything when the job has no filter', async () => {
    expect(
      await notifiedIds({ listings: [listing('near', 12), listing('far', 95)], providerId: 'commute-none' }),
    ).toEqual(['near', 'far']);
  });

  it('leaves out the listing that is further away than the job said', async () => {
    expect(
      await notifiedIds({
        listings: [listing('near', 12), listing('far', 95)],
        providerId: 'commute-notify',
        commuteFilter: { action: 'notify', limits: { Work: 30 } },
      }),
    ).toEqual(['near']);
  });

  /**
   * The reason `notify` is allowed to exist. A held-back listing is still a listing the user found:
   * it stays in the database, on the map and in the "reachable within" filter, and only the push is
   * skipped. Deleting it here would also make it new again on the next run.
   */
  it('keeps the held-back listing rather than deleting it', async () => {
    expect(
      await notifiedIds({
        listings: [listing('far', 95)],
        providerId: 'commute-kept',
        commuteFilter: { action: 'notify', limits: { Work: 30 } },
      }),
    ).toEqual([]);
    expect(mockStore.deletedIds).not.toContain('far');
  });

  it('soft-deletes the listing when the job asked for that instead', async () => {
    expect(
      await notifiedIds({
        listings: [listing('near', 12), listing('far', 95)],
        providerId: 'commute-exclude',
        commuteFilter: { action: 'exclude', limits: { Work: 30 } },
      }),
    ).toEqual(['near']);
    expect(mockStore.deletedIds).toContain('far');
    expect(mockStore.deletedIds).not.toContain('near');
  });

  /** `mark` is the filter opting out of filtering: the colours are a rendering concern. */
  it('changes nothing when the job only wants it marked', async () => {
    expect(
      await notifiedIds({
        listings: [listing('near', 12), listing('far', 95)],
        providerId: 'commute-mark',
        commuteFilter: { action: 'mark', limits: { Work: 30 } },
      }),
    ).toEqual(['near', 'far']);
    expect(mockStore.deletedIds).toHaveLength(0);
  });

  it('never holds back a listing whose travel time is unknown', async () => {
    expect(
      await notifiedIds({
        listings: [listing('unmeasured', null)],
        providerId: 'commute-unknown',
        commuteFilter: { action: 'exclude', limits: { Work: 30 } },
      }),
    ).toEqual(['unmeasured']);
    expect(mockStore.deletedIds).toHaveLength(0);
  });

  it('ignores a limit for an address the user no longer has', async () => {
    expect(
      await notifiedIds({
        listings: [listing('far', 95)],
        providerId: 'commute-stale-label',
        commuteFilter: { action: 'exclude', limits: { 'Old office': 30 } },
      }),
    ).toEqual(['far']);
    expect(mockStore.deletedIds).toHaveLength(0);
  });

  it('does nothing when the owner has no addresses at all', async () => {
    mockStore.setUserSettings(null);
    expect(
      await notifiedIds({
        listings: [listing('far', 95)],
        providerId: 'commute-no-addresses',
        commuteFilter: { action: 'exclude', limits: { Work: 30 } },
      }),
    ).toEqual(['far']);
    expect(mockStore.deletedIds).toHaveLength(0);
  });
});
