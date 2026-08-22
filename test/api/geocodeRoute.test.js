/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({})),
  getUserSettings: vi.fn(() => ({})),
  upsertSettings: vi.fn(),
}));
vi.mock('../../lib/services/geocoding/geoCodingService.js', () => ({ geocodeAddress: vi.fn() }));
vi.mock('../../lib/services/geocoding/autocompleteService.js', () => ({ autocompleteAddress: vi.fn(async () => []) }));
vi.mock('../../lib/services/geocoding/distanceService.js', () => ({ updateDistancesForAddressChange: vi.fn() }));
vi.mock('../../lib/services/crons/geocoding-cron.js', () => ({ runGeoCordTask: vi.fn() }));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
// Country resolution reads the provider modules and the job storage. Both are somebody else's test;
// what matters here is that whatever it answers reaches the geocoder.
vi.mock('../../lib/services/providers/providerCountries.js', () => ({
  getCountriesForProviderIds: vi.fn(async () => ['fr']),
  getCountriesForUser: vi.fn(async () => ['de', 'at']),
}));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));

import { geocodeAddress } from '../../lib/services/geocoding/geoCodingService.js';
import { autocompleteAddress } from '../../lib/services/geocoding/autocompleteService.js';
import { getCountriesForProviderIds, getCountriesForUser } from '../../lib/services/providers/providerCountries.js';
import userSettingsPlugin from '../../lib/api/routes/userSettingsRoute.js';

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.session = { currentUser: 'user-1' };
  });
  await app.register(userSettingsPlugin);
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

// The address search above the job form's map depends on this route answering with coordinates,
// and on it distinguishing "found nothing" from "went wrong" - the map has to be told which.
describe('GET /geocode', () => {
  it('returns the coordinates of an address', async () => {
    geocodeAddress.mockResolvedValue({ lat: 51.219734, lng: 6.7943015 });
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/geocode?q=D%C3%BCsseldorf%20Hbf' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ lat: 51.219734, lng: 6.7943015 });
    expect(geocodeAddress).toHaveBeenCalledWith('Düsseldorf Hbf', ['de', 'at']);
  });

  it('trims the query before geocoding it', async () => {
    geocodeAddress.mockResolvedValue({ lat: 1, lng: 2 });
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/geocode?q=%20%20Bremen%20%20' });

    expect(geocodeAddress).toHaveBeenCalledWith('Bremen', ['de', 'at']);
  });

  it('rejects an empty query without calling the geocoder', async () => {
    const app = await buildApp();
    for (const url of ['/geocode', '/geocode?q=', '/geocode?q=%20%20']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(400);
    }
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it('reports an address that could not be located as 404', async () => {
    // Nominatim answers "looked, found nothing" with -1/-1. Passing that through would drop the
    // map into the Atlantic instead of telling the user the address did not resolve.
    geocodeAddress.mockResolvedValue({ lat: -1, lng: -1 });
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/geocode?q=nowhere' });

    expect(response.statusCode).toBe(404);
  });

  it('reports a missing result as 404 rather than an empty 200', async () => {
    geocodeAddress.mockResolvedValue(null);
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/geocode?q=nowhere' });

    expect(response.statusCode).toBe(404);
  });

  it('surfaces a geocoder failure as a 500', async () => {
    geocodeAddress.mockRejectedValue(new Error('upstream exploded'));
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/geocode?q=Bremen' });

    expect(response.statusCode).toBe(500);
  });
});

// Which countries a lookup searches decides whether an address outside Germany resolves at all. The
// job form knows the providers it has ticked and says so; everybody else gets the user-wide union.
describe('countries in scope', () => {
  it('uses the providers named in the query when the job form sends them', async () => {
    geocodeAddress.mockResolvedValue({ lat: 1, lng: 2 });
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/geocode?q=Lille&providers=one,two' });

    expect(getCountriesForProviderIds).toHaveBeenCalledWith(['one', 'two']);
    expect(getCountriesForUser).not.toHaveBeenCalled();
    expect(geocodeAddress).toHaveBeenCalledWith('Lille', ['fr']);
  });

  it('falls back to the union across the user jobs when no provider is named', async () => {
    geocodeAddress.mockResolvedValue({ lat: 1, lng: 2 });
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/geocode?q=Bremen' });

    expect(getCountriesForUser).toHaveBeenCalledWith('user-1');
    expect(geocodeAddress).toHaveBeenCalledWith('Bremen', ['de', 'at']);
  });

  it('ignores an empty providers parameter rather than resolving nothing', async () => {
    geocodeAddress.mockResolvedValue({ lat: 1, lng: 2 });
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/geocode?q=Bremen&providers=%20,' });

    expect(getCountriesForProviderIds).not.toHaveBeenCalled();
    expect(geocodeAddress).toHaveBeenCalledWith('Bremen', ['de', 'at']);
  });

  it('scopes the suggestions the same way it scopes the lookup', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/autocomplete?q=Lil&providers=one' });

    expect(autocompleteAddress).toHaveBeenCalledWith('Lil', ['fr']);
  });

  // A search box must not go down because the job storage did. Germany is the same answer this
  // route gave before any of this existed.
  it('falls back to the default when the countries cannot be resolved', async () => {
    getCountriesForUser.mockRejectedValueOnce(new Error('storage is having a moment'));
    geocodeAddress.mockResolvedValue({ lat: 1, lng: 2 });
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/geocode?q=Bremen' });

    expect(response.statusCode).toBe(200);
    expect(geocodeAddress).toHaveBeenCalledWith('Bremen', ['de']);
  });
});
