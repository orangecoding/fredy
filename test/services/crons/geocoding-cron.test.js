/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { metaInformation as idealista } from '../../../lib/provider/idealista.js';

const root = (await import('node:path')).resolve('.');
const listingsStoragePath = root + '/lib/services/storage/listingsStorage.js';
const jobStoragePath = root + '/lib/services/storage/jobStorage.js';
const geoCodingPath = root + '/lib/services/geocoding/geoCodingService.js';
const distanceServicePath = root + '/lib/services/geocoding/distanceService.js';
const providerCountriesPath = root + '/lib/services/providers/providerCountries.js';
const utilsPath = root + '/lib/utils.js';
const loggerPath = root + '/lib/services/logger.js';

let state;

/**
 * The cron with everything under it replaced.
 *
 * @param {boolean} [realCountries] Leave the country resolver in place and mock the provider list
 *   underneath it instead, which is what the narrowing test needs: the point of that one is the
 *   resolution itself, and a mocked resolver would only be testing the mock.
 * @returns {Promise<any>}
 */
async function loadCron(realCountries = false) {
  vi.resetModules();
  // `doMock` registrations outlive `resetModules`, so each mode has to undo the other's.
  if (realCountries) {
    vi.doUnmock(providerCountriesPath);
    vi.doMock(utilsPath, () => ({ getProviders: async () => [{ metaInformation: idealista }] }));
  } else {
    vi.doUnmock(utilsPath);
  }
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
  if (!realCountries) {
    vi.doMock(providerCountriesPath, () => ({
      getCountriesForListing: async (providerId) => (providerId === 'swissportal' ? ['ch'] : ['de']),
    }));
  }
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

  /**
   * A provider covering several countries has to be asked about the row, not about itself.
   * idealista serves Spain, Italy and Portugal, and `countrycodes=es,it,pt` lets Nominatim answer
   * an Italian street with its Spanish namesake - which, since the area filter deletes a listing
   * that falls outside the drawn area, loses the listing rather than merely misplacing its pin.
   * The row's own link is what says which of the three it came from.
   */
  it('narrows a multi-country provider to the country the listing links to', async () => {
    state.pending = [
      {
        id: 'l1',
        address: 'Calle de Alcalá 1, Madrid',
        provider: 'idealista',
        link: 'https://www.idealista.com/inmueble/1/',
      },
      {
        id: 'l2',
        address: 'Via Tito Vignoli 1, Milano',
        provider: 'idealista',
        link: 'https://www.idealista.it/immobile/2/',
      },
      // A row whose link says nothing keeps all three, which is what the provider declares.
      { id: 'l3', address: 'Rua Augusta 1', provider: 'idealista', link: null },
    ];

    const { runGeoCordTask } = await loadCron(true);
    await runGeoCordTask();

    expect(state.geocodeCalls).toEqual([
      ['Calle de Alcalá 1, Madrid', ['es']],
      ['Via Tito Vignoli 1, Milano', ['it']],
      ['Rua Augusta 1', ['es', 'it', 'pt']],
    ]);
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
