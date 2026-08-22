/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mockFredy } from './utils.js';
import * as mockStore from './mocks/mockStore.js';

/**
 * A provider that already knows where a listing is.
 *
 * `ParsedListing` has carried optional `latitude` and `longitude` all along, and a provider reading
 * a JSON API often gets them for nothing, to the metre. The geocode step did not look: it geocoded
 * on the strength of `address` alone and assigned over whatever was there. So a provider handing
 * over an exact position had it replaced by whatever Nominatim makes of the address text, which for
 * a portal that writes a district rather than a street is the middle of the district. That is a
 * worse coordinate, bought with a request against a geocoder that allows one per second.
 */
function configFor(listing) {
  return {
    url: 'http://example.com',
    getListings: () => Promise.resolve([listing]),
    normalize: (l) => l,
    filter: () => true,
    crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
    requiredFieldNames: ['id', 'title', 'address', 'price'],
  };
}

const job = { id: 'test-job', notificationAdapter: null, specFilter: null, spatialFilter: null };

/**
 * Run one listing through the pipeline and hand back what it looked like afterwards.
 *
 * @param {Object} listing
 * @returns {Promise<Object>}
 */
async function run(listing) {
  const Fredy = await mockFredy();
  const fredy = new Fredy(configFor(listing), job, 'test-provider', { checkAndAddEntry: () => false }, undefined);
  try {
    await fredy.execute();
  } catch {
    // NoNewListingsWarning is control flow here, and the geocode step has already run.
  }
  return listing;
}

beforeEach(() => {
  mockStore.geocodedAddresses.length = 0;
  mockStore.setGeocodeResult({ lat: 51.2219, lng: 6.7844 });
});

describe('the pipeline leaves a listing the provider already located', () => {
  it('does not geocode it', async () => {
    await run({
      id: '1',
      title: 't',
      price: '100',
      link: 'http://example.com/1',
      address: '40217 Unterbilk',
      latitude: 51.2127,
      longitude: 6.7742,
    });
    expect(mockStore.geocodedAddresses).toEqual([]);
  });

  it("keeps the provider's coordinates", async () => {
    const listing = await run({
      id: '1',
      title: 't',
      price: '100',
      link: 'http://example.com/1',
      address: '40217 Unterbilk',
      latitude: 51.2127,
      longitude: 6.7742,
    });
    expect(listing).toMatchObject({ latitude: 51.2127, longitude: 6.7742 });
  });

  it('still geocodes a listing that carries no coordinates', async () => {
    const listing = await run({
      id: '1',
      title: 't',
      price: '100',
      link: 'http://example.com/1',
      address: '40217 Unterbilk',
    });
    expect(mockStore.geocodedAddresses).toEqual(['40217 Unterbilk']);
    expect(listing).toMatchObject({ latitude: 51.2219, longitude: 6.7844 });
  });

  // Half a coordinate is not a position. Skipping on one of the two would leave the listing with a
  // latitude and no longitude, which puts it nowhere and cannot be recovered later.
  it('geocodes a listing that carries only one of the two', async () => {
    await run({
      id: '1',
      title: 't',
      price: '100',
      link: 'http://example.com/1',
      address: '40217 Unterbilk',
      latitude: 51.2127,
    });
    expect(mockStore.geocodedAddresses).toEqual(['40217 Unterbilk']);
  });

  it('geocodes a listing whose coordinates are the not-found sentinel', async () => {
    await run({
      id: '1',
      title: 't',
      price: '100',
      link: 'http://example.com/1',
      address: '40217 Unterbilk',
      latitude: -1,
      longitude: -1,
    });
    expect(mockStore.geocodedAddresses).toEqual(['40217 Unterbilk']);
  });
});
