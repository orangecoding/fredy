/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockFredy, sseEvents } from './utils.js';
import * as mockStore from './mocks/mockStore.js';
import { get as getNotification, reset as resetNotification } from './mocks/mockNotification.js';

const PROVIDER = 'excluded-locations-provider';
const advert = (id, address) => ({ id, title: 'Flat', link: `https://example.com/${id}`, price: 1000, address });

/** Run real pipeline orchestration with external I/O replaced by the existing fixture helpers. */
async function run(
  page,
  { jobId = 'job-1', excludedLocations = ['Neukölln'], fetchDetails, normalize = (item) => item } = {},
) {
  const Fredy = await mockFredy();
  const pipeline = new Fredy(
    {
      url: 'https://example.com/search',
      getListings: async () => page,
      normalize,
      filter: () => true,
      requiredFieldNames: ['id', 'title', 'link'],
      fetchDetails,
    },
    { id: jobId, notificationAdapter: [], ...(excludedLocations == null ? {} : { excludedLocations }) },
    PROVIDER,
    { checkAndAddEntry: () => false },
    undefined,
    { maxDetailFetches: null },
  );
  await pipeline.execute();
  return mockStore.getKnownListingHashesForJobAndProvider(jobId, PROVIDER);
}

describe('per-job location exclusions in the pipeline', () => {
  beforeEach(() => {
    mockStore.resetListings();
    mockStore.geocodedAddresses.length = 0;
    mockStore.deletedIds.length = 0;
    sseEvents.length = 0;
    resetNotification();
    mockStore.setUserSettings({ provider_details: [PROVIDER], blacklist_filter_on_provider_details: false });
    vi.spyOn(mockStore, 'getSettings').mockResolvedValue({ excludedLocations: ['Mitte'] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockStore.setUserSettings(null);
  });

  it('rejects normalized addresses before details, geocoding, storage, SSE and notifications', async () => {
    const fetchDetails = vi.fn(async (item) => item);
    const stored = await run([advert('excluded', 'raw'), advert('allowed', 'Berlin Mitte')], {
      normalize: (item) => ({ ...item, address: item.id === 'excluded' ? 'Berlin Neukölln' : item.address }),
      fetchDetails,
    });

    expect(stored.map((item) => item.id)).toEqual(['allowed']);
    expect(fetchDetails.mock.calls.map(([item]) => item.id)).toEqual(['allowed']);
    expect(mockStore.geocodedAddresses).toEqual(['Berlin Mitte']);
    expect(getNotification().payload.map((item) => item.id)).toEqual(['allowed']);
    expect(sseEvents).toEqual([{ userId: 'user1', event: 'listings:new', data: { jobId: 'job-1', count: 1 } }]);
    expect(mockStore.deletedIds).toEqual([]);
  });

  it('rechecks detail-enriched addresses even when the optional blacklist recheck is disabled', async () => {
    const stored = await run([advert('excluded', 'Berlin'), advert('allowed', 'Berlin Mitte')], {
      fetchDetails: async (item) => ({ ...item, address: item.id === 'excluded' ? 'Berlin Neukölln' : item.address }),
    });

    expect(stored.map((item) => item.id)).toEqual(['allowed']);
    expect(mockStore.geocodedAddresses).toEqual(['Berlin Mitte']);
    expect(getNotification().payload.map((item) => item.id)).toEqual(['allowed']);
  });

  it('sends nothing when every listing is excluded', async () => {
    await run([advert('excluded', 'Berlin Neukölln')]);
    expect(getNotification()).toEqual({});
    expect(mockStore.getKnownListingHashesForJobAndProvider('job-1', PROVIDER)).toEqual([]);
    expect(sseEvents).toEqual([]);
  });

  it('sends nothing when details reveal that every listing is excluded', async () => {
    await run([advert('excluded', undefined)], {
      fetchDetails: async (item) => ({ ...item, address: 'Berlin Neukölln' }),
    });
    expect(getNotification()).toEqual({});
    expect(mockStore.getKnownListingHashesForJobAndProvider('job-1', PROVIDER)).toEqual([]);
    expect(sseEvents).toEqual([]);
  });

  it('isolates exclusions between jobs, ignoring any obsolete global setting', async () => {
    const page = [advert('neukoelln', 'Berlin Neukölln'), advert('marzahn', 'Berlin Marzahn')];
    expect(
      (await run(page, { jobId: 'job-a', excludedLocations: ['Neukölln', 'Spandau'] })).map((item) => item.id),
    ).toEqual(['marzahn']);
    mockStore.resetListings();
    expect((await run(page, { jobId: 'job-b', excludedLocations: ['Marzahn'] })).map((item) => item.id)).toEqual([
      'neukoelln',
    ]);
  });

  it('allows all locations for an existing job without exclusions', async () => {
    const stored = await run([advert('allowed', 'Berlin Mitte')], { excludedLocations: null });
    expect(stored.map((item) => item.id)).toEqual(['allowed']);
    expect(getNotification().payload).toHaveLength(1);
  });

  it('allows missing addresses and does not match place names mentioned only in descriptions', async () => {
    const stored = await run(
      [
        advert('unknown', undefined),
        advert('placeholder', 'NO ADDRESS FOUND'),
        { ...advert('other', 'Berlin Mitte'), description: 'Close to Neukölln' },
      ],
      { excludedLocations: ['Neukölln', 'No'] },
    );
    expect(stored.map((item) => item.id)).toEqual(['unknown', 'placeholder', 'other']);
    expect(getNotification().payload).toHaveLength(3);
  });
});
