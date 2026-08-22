/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Which countries a geocode is scoped to, from the Nominatim request up.
 *
 * `countrycodes=de` used to be written into the client, so an address outside Germany came back
 * empty and the listing was stored without coordinates - no area filter, no travel time. The scope
 * now travels with the call, and a provider that declares nothing still gets exactly the request it
 * got before.
 */
const root = (await import('node:path')).resolve('.');
const clientPath = root + '/lib/services/geocoding/client/nominatimClient.js';
const servicePath = root + '/lib/services/geocoding/geoCodingService.js';

/**
 * @param {number} status
 * @param {unknown} [body]
 * @returns {Object}
 */
const answer = (status, body = []) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

describe('the countries a Nominatim request is scoped to', () => {
  /** @type {string[]} */
  let urls;
  /** @type {any} */
  let client;

  beforeEach(async () => {
    vi.resetModules();
    urls = [];
    vi.doMock('node-fetch', () => ({
      default: async (url) => {
        urls.push(url);
        return answer(200, [{ lat: '48.85', lon: '2.35' }]);
      },
    }));
    client = await import(clientPath);
    client.__resetRateLimit();
  });

  it('still asks for Germany when nothing was declared', async () => {
    await client.geocode('Domplatte, Köln');

    expect(urls[0]).toContain('countrycodes=de');
  });

  it('carries a declared country instead', async () => {
    await client.geocode('12 Rue de Rivoli, Paris', ['fr']);

    expect(urls[0]).toContain('countrycodes=fr');
  });

  // Nominatim takes a comma separated list, which is what keeps a provider spanning three countries
  // from costing three requests per address.
  it('sends several countries as one request', async () => {
    await client.geocode('Hauptstrasse 1', ['de', 'at', 'ch']);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('countrycodes=de%2Cat%2Cch');
  });

  it('scopes the suggestions the same way', async () => {
    await client.autocomplete('Hauptstr', ['at']);

    expect(urls[0]).toContain('countrycodes=at');
  });

  it('falls back to Germany when handed an empty list', async () => {
    await client.geocode('Domplatte, Köln', []);

    expect(urls[0]).toContain('countrycodes=de');
  });
});

/**
 * The cache in front of Nominatim matches on the address text alone. That was safe while every
 * provider was German; a Swiss or Austrian portal brings street names spelled exactly like German
 * ones, and without a scope the first row geocoded would answer for both countries forever.
 */
describe('the geocode cache', () => {
  /** @type {any} */
  let getGeocoordinatesByAddress;
  /** @type {any} */
  let geocode;
  /** @type {any} */
  let service;

  beforeEach(async () => {
    vi.resetModules();
    getGeocoordinatesByAddress = vi.fn(() => null);
    geocode = vi.fn(async () => ({ lat: 1, lng: 2 }));

    vi.doMock(root + '/lib/services/storage/listingsStorage.js', () => ({ getGeocoordinatesByAddress }));
    vi.doMock(root + '/lib/services/geocoding/client/nominatimClient.js', () => ({
      geocode,
      isPaused: () => false,
    }));
    vi.doMock(root + '/lib/services/providers/providerCountries.js', () => ({
      getProviderIdsForCountries: vi.fn(async (countries) =>
        countries.includes('fr') ? ['frenchportal'] : ['immowelt'],
      ),
    }));
    vi.doMock(root + '/lib/services/logger.js', () => ({
      default: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    }));

    service = await import(servicePath);
  });

  it('only lets the providers of the countries being asked about answer', async () => {
    await service.geocodeAddress('Hauptstrasse 5', ['fr']);

    expect(getGeocoordinatesByAddress).toHaveBeenCalledWith('Hauptstrasse 5', ['frenchportal']);
  });

  it('passes the countries on to Nominatim when the cache misses', async () => {
    await service.geocodeAddress('Hauptstrasse 5', ['fr']);

    expect(geocode).toHaveBeenCalledWith('Hauptstrasse 5', ['fr']);
  });

  it('never reaches Nominatim when the cache answers', async () => {
    getGeocoordinatesByAddress.mockReturnValue({ lat: 50, lng: 8 });

    await expect(service.geocodeAddress('Domplatte, Köln')).resolves.toEqual({ lat: 50, lng: 8 });
    expect(geocode).not.toHaveBeenCalled();
  });

  it('defaults to Germany for a caller that names no country', async () => {
    await service.geocodeAddress('Domplatte, Köln');

    expect(geocode).toHaveBeenCalledWith('Domplatte, Köln', ['de']);
  });
});
