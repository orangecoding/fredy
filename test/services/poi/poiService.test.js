/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Which real places a listing is measured against, and what that costs.
 *
 * The cost is the point. Overpass is asked once per ~1.1 km grid cell per category and the answer
 * is kept in the database for weeks, so a street's worth of listings costs one query. The
 * shortlisting that follows is per listing and free.
 */
const root = (await import('node:path')).resolve('.');
const servicePath = root + '/lib/services/poi/poiService.js';
const cachePath = root + '/lib/services/storage/poiCacheStorage.js';
const overpassPath = root + '/lib/services/poi/overpassClient.js';
const settingsPath = root + '/lib/services/storage/settingsStorage.js';
const loggerPath = root + '/lib/services/logger.js';

/** Berlin, Unter den Linden. */
const LAT = 52.517;
const LNG = 13.3888;
const NOW = new Date(2026, 7, 3, 9, 0, 0).getTime();

let state;
let service;

/** Roughly `meters` north of the listing. */
const north = (name, meters) => ({ name, lat: LAT + meters / 111320, lng: LNG });

async function load() {
  vi.resetModules();

  vi.doMock(cachePath, async () => {
    const actual = await vi.importActual(cachePath);
    return {
      ...actual,
      getCachedPlaces: ({ cellLat, cellLng, category, freshAfter }) => {
        const row = state.cache.get(`${cellLat},${cellLng}/${category}`);
        return row != null && row.fetchedAt > freshAfter ? row.places : null;
      },
      saveCachedPlaces: ({ cellLat, cellLng, category, places, fetchedAt }) => {
        state.writes.push({ cellLat, cellLng, category, places, fetchedAt });
        state.cache.set(`${cellLat},${cellLng}/${category}`, { places, fetchedAt });
      },
    };
  });
  vi.doMock(overpassPath, () => ({
    isOverpassPaused: () => state.paused,
    findPlaces: async (params) => {
      state.lookups.push(params);
      return state.answer;
    },
  }));
  vi.doMock(settingsPath, () => ({ getSettings: async () => state.settings }));
  vi.doMock(loggerPath, () => ({ default: { debug: () => {}, warn: () => {}, error: () => {}, info: () => {} } }));

  service = await import(servicePath);
}

beforeEach(async () => {
  state = {
    cache: new Map(),
    writes: [],
    lookups: [],
    paused: false,
    answer: [north('Edeka', 900), north('Rewe', 300), north('Lidl', 600)],
    settings: { poiSearchRadiusMeters: 8000, poiCacheMaxAgeDays: 30 },
  };
  await load();
});

describe('findNearbyPlaces', () => {
  it('ranks candidates by how far they actually are from the listing', async () => {
    const places = await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'supermarket', now: NOW });

    // Measured from the listing, not from the cell centre the query was anchored at - which is the
    // whole reason the cache can afford to be coarse.
    expect(places.map((place) => place.name)).toEqual(['Rewe', 'Lidl', 'Edeka']);
  });

  it('asks Overpass once for two listings in the same cell', async () => {
    await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'supermarket', now: NOW });
    await service.findNearbyPlaces({ lat: LAT + 0.001, lng: LNG + 0.001, category: 'supermarket', now: NOW });

    expect(state.lookups).toHaveLength(1);
  });

  it('collapses two concurrent misses of one cell into a single request', async () => {
    const [a, b] = await Promise.all([
      service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'supermarket', now: NOW }),
      service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'supermarket', now: NOW }),
    ]);

    expect(state.lookups).toHaveLength(1);
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
  });

  it('keeps two categories at one cell apart', async () => {
    await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'supermarket', now: NOW });
    await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'bakery', now: NOW });

    expect(state.lookups).toHaveLength(2);
    expect(state.lookups.map((lookup) => lookup.category)).toEqual(['supermarket', 'bakery']);
  });

  it('asks again once the cached answer has aged out', async () => {
    await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'supermarket', now: NOW });
    const muchLater = NOW + 31 * 24 * 60 * 60 * 1000;

    await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'supermarket', now: muchLater });

    expect(state.lookups).toHaveLength(2);
  });

  it('searches wider than the listing needs, because the query is anchored at the cell centre', async () => {
    await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'supermarket', now: NOW });

    // Without the extra, a listing in the far corner of a cell would be missing exactly the places
    // nearest to it.
    expect(state.lookups[0].radiusMeters).toBeGreaterThan(state.settings.poiSearchRadiusMeters);
  });

  it('caches an empty answer, because "no pharmacy in this village" is a fact', async () => {
    state.answer = [];
    await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'pharmacy', now: NOW });
    await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'pharmacy', now: NOW });

    expect(state.lookups).toHaveLength(1);
    expect(state.writes).toHaveLength(1);
  });

  it('never caches a failed lookup', async () => {
    state.answer = null;
    const result = await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'supermarket', now: NOW });

    // Caching it would turn one rate limit into "there are no supermarkets here" for a month.
    expect(result).toBeNull();
    expect(state.writes).toHaveLength(0);
  });

  it('caps the shortlist, so a dense city cannot make one listing expensive', async () => {
    state.answer = Array.from({ length: 40 }, (_, i) => north(`Shop ${i}`, 100 + i * 10));

    const places = await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'supermarket', now: NOW });

    expect(places).toHaveLength(service.MAX_CANDIDATES);
    expect(places[0].name).toBe('Shop 0');
  });

  it('drops a cached place that is beyond the radius for this particular listing', async () => {
    state.answer = [north('Far', 20000), north('Near', 500)];

    const places = await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'supermarket', now: NOW });

    expect(places.map((place) => place.name)).toEqual(['Near']);
  });

  it('asks nothing at all while Overpass is being left alone', async () => {
    state.paused = true;

    const result = await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'supermarket', now: NOW });

    expect(result).toBeNull();
    expect(state.lookups).toHaveLength(0);
  });

  it('refuses a category it does not know how to look for', async () => {
    const result = await service.findNearbyPlaces({ lat: LAT, lng: LNG, category: 'casino', now: NOW });

    expect(result).toBeNull();
    expect(state.lookups).toHaveLength(0);
  });
});
