/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const listingsStoragePath = root + '/lib/services/storage/listingsStorage.js';
const jobStoragePath = root + '/lib/services/storage/jobStorage.js';
const geoCodingPath = root + '/lib/services/geocoding/geoCodingService.js';
const distanceServicePath = root + '/lib/services/geocoding/distanceService.js';
const providerCountriesPath = root + '/lib/services/providers/providerCountries.js';
const loggerPath = root + '/lib/services/logger.js';

let state;

async function loadCron() {
  vi.resetModules();
  vi.doMock(listingsStoragePath, () => ({
    getListingsToGeocode: () => state.pending,
    updateListingGeocoordinates: (id, lat, lng) => state.stored.push({ id, lat, lng }),
  }));
  vi.doMock(geoCodingPath, () => ({
    geocodeAddress: async (...args) => {
      state.geocodeCalls.push(args);
      return state.coords;
    },
    isGeocodingPaused: () => state.paused,
  }));
  vi.doMock(providerCountriesPath, () => ({
    getCountriesForProvider: async (providerId) => (providerId === 'swissportal' ? ['ch'] : ['de']),
  }));
  vi.doMock(jobStoragePath, () => ({ getJobs: () => [] }));
  vi.doMock(distanceServicePath, () => ({ calculateDistanceForJob: () => {} }));
  vi.doMock(loggerPath, () => ({ default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } }));
  vi.doMock('node-cron', () => ({ default: { schedule: () => {} } }));
  return import(root + '/lib/services/crons/geocoding-cron.js');
}

/**
 * The six-hourly sweep is what eventually gives a listing coordinates when the geocode at scrape
 * time came back empty. It has no job and no run behind it, only rows, so the provider on the row is
 * the only thing that says which country the address is in - which is why the query that feeds it
 * selects `provider` alongside the address.
 */
describe('services/crons/geocoding-cron', () => {
  beforeEach(() => {
    state = {
      pending: [],
      stored: [],
      geocodeCalls: [],
      coords: { lat: 47.37, lng: 8.54 },
      paused: false,
    };
  });

  it('geocodes each listing in the countries of the provider that found it', async () => {
    state.pending = [
      { id: 'l1', address: 'Bahnhofstrasse 1, Zürich', provider: 'swissportal' },
      { id: 'l2', address: 'Domplatte, Köln', provider: 'immowelt' },
    ];

    const { runGeoCordTask } = await loadCron();
    await runGeoCordTask();

    expect(state.geocodeCalls).toEqual([
      ['Bahnhofstrasse 1, Zürich', ['ch']],
      ['Domplatte, Köln', ['de']],
    ]);
  });

  it('stores what it finds', async () => {
    state.pending = [{ id: 'l1', address: 'Bahnhofstrasse 1, Zürich', provider: 'swissportal' }];

    const { runGeoCordTask } = await loadCron();
    await runGeoCordTask();

    expect(state.stored).toEqual([{ id: 'l1', lat: 47.37, lng: 8.54 }]);
  });

  // Queueing more requests at a geocoder that has already refused only extends the stand-off.
  it('stops as soon as the geocoder is standing off', async () => {
    state.paused = true;
    state.pending = [{ id: 'l1', address: 'Domplatte, Köln', provider: 'immowelt' }];

    const { runGeoCordTask } = await loadCron();
    await runGeoCordTask();

    expect(state.geocodeCalls).toEqual([]);
    expect(state.stored).toEqual([]);
  });

  // Saving a home address kicks off a sweep too, without awaiting it. Two at once do the same work
  // twice and burn the shared rate limit against each other.
  it('skips a trigger while another sweep is still running', async () => {
    state.pending = [{ id: 'l1', address: 'Domplatte, Köln', provider: 'immowelt' }];

    const { runGeoCordTask } = await loadCron();
    const first = runGeoCordTask();
    const second = runGeoCordTask();

    await expect(second).resolves.toBe(false);
    await expect(first).resolves.toBe(true);
  });
});
