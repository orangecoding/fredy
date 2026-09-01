/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const storagePath = root + '/lib/services/storage/listingsStorage.js';
const settingsPath = root + '/lib/services/storage/settingsStorage.js';
const clientPath = root + '/lib/services/transit/transitousClient.js';
const reachabilityPath = root + '/lib/services/transit/reachabilityService.js';
const planPath = root + '/lib/services/transit/travelTimeService.js';
const loggerPath = root + '/lib/services/logger.js';
const poiPath = root + '/lib/services/poi/poiService.js';
const overpassPath = root + '/lib/services/poi/overpassClient.js';

/** Berlin, Unter den Linden - where every listing in these cases sits. */
const LAT = 52.517;
const LNG = 13.3888;

/** Fixed "now", so the reference departure is deterministic. A Monday. */
const NOW = new Date(2026, 7, 3, 9, 0, 0).getTime();

let state;

/**
 * Load the sweeper with everything that touches the network or the database replaced.
 *
 * @returns {Promise<{run: Function, updateForListings: Function, refine: Function}>}
 */
async function loadSweeper() {
  vi.resetModules();

  vi.doMock(storagePath, () => ({
    getListingsDueForTravelTimes: ({ limit }) => state.due.slice(0, limit),
    getTravelTimesForListings: (ids) =>
      new Map(ids.filter((id) => state.stored.has(id)).map((id) => [id, state.stored.get(id)])),
    saveListingTravelTimes: (listingId, entries, _at, opts) =>
      state.saved.push({ listingId, entries, stamp: opts?.stamp !== false }),
    recordTravelTimeFailure: (listingId) => state.failures.push(listingId),
  }));
  vi.doMock(settingsPath, () => ({
    getSettings: async () => state.settings,
    getUserSettings: (userId) => ({ home_addresses: state.addressesByUser[userId] ?? [] }),
    getAddresses: (settings) => settings?.home_addresses ?? [],
  }));
  vi.doMock(clientPath, () => ({ isTransitPaused: () => state.paused }));
  vi.doMock(reachabilityPath, async () => {
    const actual = await vi.importActual(reachabilityPath);
    return {
      ...actual,
      getReachableStops: async (params) => {
        state.reachabilityCalls.push(params);
        return state.stops;
      },
    };
  });
  vi.doMock(planPath, async () => {
    const actual = await vi.importActual(planPath);
    return {
      ...actual,
      getTravelTimes: async (params) => {
        state.planCalls.push(params);
        return state.planResult;
      },
      getStreetRoute: async (params) => {
        state.streetCalls.push(params);
        return state.streetResult;
      },
      getPlaceMatrix: async (params) => {
        state.matrixCalls.push(params);
        return state.matrixResult(params);
      },
    };
  });
  vi.doMock(poiPath, () => ({
    findNearbyPlaces: async (params) => {
      state.poiCalls.push(params);
      return state.placesByCategory[params.category] ?? null;
    },
  }));
  vi.doMock(overpassPath, () => ({ isOverpassPaused: () => state.overpassPaused }));
  vi.doMock(loggerPath, () => ({
    default: { debug: () => {}, warn: () => {}, error: () => {}, info: () => {} },
  }));

  const module = await import(root + '/lib/services/listings/travelTimeSweeper.js');
  return {
    run: module.default,
    updateForListings: module.updateTravelTimesForListings,
    refine: module.refineTravelTimesForListing,
  };
}

/**
 * A stored row as it comes back from SQLite, in snake_case.
 *
 * @param {Object} overrides
 * @returns {Object}
 */
const storedRow = (overrides = {}) => ({
  label: 'Home',
  origin_lat: 52.52,
  origin_lng: 13.405,
  transit_minutes: 25,
  transit_transfers: 1,
  car_minutes: null,
  car_distance_meters: null,
  car_geometry: null,
  bike_minutes: null,
  walk_minutes: null,
  is_estimate: 1,
  estimate_mode: 'transit',
  via_stops: JSON.stringify([{ name: 'Hbf', lat: 52.5, lng: 13.4, minutes: 18, transfers: 1, walkMeters: 200 }]),
  reference_time: new Date(2026, 7, 4, 8, 0, 0).getTime(),
  computed_at: NOW - 1000,
  ...overrides,
});

/**
 * A place type as it is stored in `home_addresses`.
 *
 * @param {Object} overrides
 * @returns {Object}
 */
const placeType = (overrides = {}) => ({
  kind: 'category',
  label: 'Groceries',
  category: 'supermarket',
  mode: 'walk',
  ...overrides,
});

/** Two supermarkets near the listing, the second one closer by road than by air. */
const SUPERMARKETS = [
  { name: 'Edeka', lat: LAT + 0.002, lng: LNG, meters: 222 },
  { name: 'Rewe', lat: LAT, lng: LNG + 0.004, meters: 270 },
];

const address = (overrides = {}) => ({
  label: 'Home',
  address: 'Alexanderplatz, Berlin',
  coords: { lat: 52.52, lng: 13.405 },
  departure: { time: '08:00' },
  ...overrides,
});

beforeEach(() => {
  state = {
    due: [{ id: 'l1', latitude: LAT, longitude: LNG, job_id: 'j1', user_id: 'u1' }],
    stored: new Map(),
    saved: [],
    failures: [],
    addressesByUser: { u1: [address()] },
    settings: {
      travelTimeLimitPerRun: 500,
      travelTimeMaxAgeDays: 30,
      travelTimeMaxMinutes: 90,
      travelTimeStreetLookupsPerRun: 15,
      poiLookupsPerRun: 40,
      poiEnabled: true,
    },
    paused: false,
    // 200 m from the listing, so it counts as reachable on foot from the stop.
    stops: [{ lat: LAT + 200 / 111320, lng: LNG, minutes: 18, transfers: 1 }],
    planResult: { ok: false, reason: 'unavailable' },
    streetResult: { ok: true, route: { minutes: 15, distanceMeters: 14358, geometry: 'abc' } },
    reachabilityCalls: [],
    planCalls: [],
    streetCalls: [],
    poiCalls: [],
    matrixCalls: [],
    overpassPaused: false,
    placesByCategory: { supermarket: SUPERMARKETS, gym: SUPERMARKETS, bakery: SUPERMARKETS },
    // The second candidate wins by default, which is what proves the winner comes from the routing
    // rather than from the straight-line order.
    matrixResult: ({ groups }) => ({
      ok: true,
      matches: new Map(
        groups.map((group) => [group.label, { index: 1, minutes: 7, distanceMeters: 540, transfers: 0, walk: null }]),
      ),
    }),
  };
});

describe('runTravelTimeSweep', () => {
  it('asks the routing service once per address, not once per listing', async () => {
    state.due = Array.from({ length: 25 }, (_, i) => ({
      id: `l${i}`,
      latitude: LAT,
      longitude: LNG,
      job_id: 'j1',
      user_id: 'u1',
    }));

    const { run } = await loadSweeper();
    const result = await run({ now: NOW });

    expect(result.listings).toBe(25);
    // This is the whole reason for the design the Transitous maintainers asked for.
    expect(state.reachabilityCalls).toHaveLength(1);
    expect(state.planCalls).toHaveLength(0);
  });

  it('never runs a street routing, so no car time is written by a sweep', async () => {
    const { run } = await loadSweeper();
    await run({ now: NOW });

    const [entry] = state.saved[0].entries;
    expect(entry.transitMinutes).toBeGreaterThan(18);
    expect(entry.carMinutes).toBeNull();
    expect(entry.isEstimate).toBe(true);
  });

  it('records the stops the estimate came from', async () => {
    const { run } = await loadSweeper();
    await run({ now: NOW });

    const [entry] = state.saved[0].entries;
    expect(entry.viaStops).toHaveLength(1);
    expect(entry.viaStops[0]).toMatchObject({ minutes: 18, transfers: 1 });
    expect(entry.viaStops[0].walkMeters).toBeGreaterThan(150);
  });

  it('stops before asking anything while the upstream is rate limiting us', async () => {
    state.paused = true;

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.reachabilityCalls).toHaveLength(0);
    expect(state.saved).toHaveLength(0);
  });

  it('leaves a fresh row alone instead of recomputing it', async () => {
    state.stored.set('l1', [storedRow()]);

    const { run } = await loadSweeper();
    await run({ now: NOW });

    // Still written - that is what restamps the listing - but with the stored numbers untouched.
    expect(state.saved[0].entries[0].transitMinutes).toBe(25);
    expect(state.saved[0].entries[0].computedAt).toBe(NOW - 1000);
  });

  it('redoes an estimate that cannot say which stops it came from', async () => {
    // Written before the stop list was recorded. Cheap to redo: the sweep already has the
    // reachability answer, so this costs no request at all.
    state.stored.set('l1', [storedRow({ via_stops: null })]);

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.streetCalls).toHaveLength(0);
    expect(state.saved[0].entries[0].viaStops).toHaveLength(1);
  });

  it('leaves an estimate that already has its stops alone', async () => {
    state.stored.set('l1', [storedRow({ via_stops: JSON.stringify([{ name: 'Hbf', minutes: 18 }]) })]);

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.saved[0].entries[0].transitMinutes).toBe(25);
  });

  it('carries a row over under its new name when an address is only renamed', async () => {
    state.stored.set('l1', [storedRow({ label: 'Old name' })]);
    state.addressesByUser.u1 = [address({ label: 'Work' })];

    const { run } = await loadSweeper();
    await run({ now: NOW });

    const [entry] = state.saved[0].entries;
    expect(entry.label).toBe('Work');
    expect(entry.transitMinutes).toBe(25);
  });

  it('recomputes when the address moved to different coordinates', async () => {
    state.stored.set('l1', [storedRow({ origin_lat: 50.1, origin_lng: 8.6 })]);

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.saved[0].entries[0].transitMinutes).not.toBe(25);
  });

  it('recomputes when the departure time changed', async () => {
    state.stored.set('l1', [storedRow({ reference_time: 1 })]);

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.saved[0].entries[0].referenceTime).not.toBe(1);
  });

  it('drops the row of an address the user removed', async () => {
    state.stored.set('l1', [storedRow(), storedRow({ label: 'Gone' })]);

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.saved[0].entries.map((entry) => entry.label)).toEqual(['Home']);
  });

  it('keeps an exact row rather than writing an estimate over it', async () => {
    state.stored.set('l1', [storedRow({ is_estimate: 0, transit_minutes: 31, car_minutes: 12 })]);

    const { run } = await loadSweeper();
    await run({ now: NOW });

    const [entry] = state.saved[0].entries;
    expect(entry.isEstimate).toBe(false);
    expect(entry.carMinutes).toBe(12);
  });

  it('falls back to a driving time where public transport does not reach', async () => {
    // No stop within walking distance: a village with no bus.
    state.stops = [{ lat: LAT + 5000 / 111320, lng: LNG, minutes: 10, transfers: 0 }];

    const { run } = await loadSweeper();
    const result = await run({ now: NOW });

    expect(state.streetCalls).toHaveLength(1);
    const [entry] = state.saved[0].entries;
    expect(entry.transitMinutes).toBeNull();
    expect(entry.carMinutes).toBe(15);
    expect(entry.carGeometry).toBe('abc');
    expect(result.streetLookups).toBe(1);
    // Answered after all, so it must not be counted against the listing.
    expect(state.failures).toEqual([]);
  });

  it('never spends a driving lookup where transit already answered', async () => {
    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.streetCalls).toHaveLength(0);
  });

  it('caps the driving lookups so a rural instance trickles rather than bursts', async () => {
    state.settings.travelTimeStreetLookupsPerRun = 3;
    state.stops = [{ lat: LAT + 5000 / 111320, lng: LNG, minutes: 10, transfers: 0 }];
    state.due = Array.from({ length: 10 }, (_, i) => ({
      id: `l${i}`,
      latitude: LAT,
      longitude: LNG,
      job_id: 'j1',
      user_id: 'u1',
    }));

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.streetCalls).toHaveLength(3);
  });

  it('counts a listing nothing can reach, so it stops being asked about forever', async () => {
    state.stops = [{ lat: LAT + 5000 / 111320, lng: LNG, minutes: 10, transfers: 0 }];
    state.streetResult = { ok: false, reason: 'unroutable' };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.failures).toEqual(['l1']);
    expect(state.saved).toHaveLength(0);
  });

  it('does not count a driving outage against the listing', async () => {
    state.stops = [{ lat: LAT + 5000 / 111320, lng: LNG, minutes: 10, transfers: 0 }];
    state.streetResult = { ok: false, reason: 'unavailable' };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.failures).toEqual([]);
    expect(state.saved).toHaveLength(0);
  });

  it('does not count an outage against the listing', async () => {
    state.stops = null;

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.failures).toEqual([]);
  });

  it('measures an address by car when that is what the user asked for', async () => {
    state.addressesByUser.u1 = [address({ mode: 'car' })];

    const { run } = await loadSweeper();
    await run({ now: NOW });

    // No timetable is needed for a driver, so the region-wide lookup is never made.
    expect(state.reachabilityCalls).toHaveLength(0);
    expect(state.streetCalls).toHaveLength(1);
    expect(state.streetCalls[0].mode).toBe('car');

    const [entry] = state.saved[0].entries;
    expect(entry.carMinutes).toBe(15);
    expect(entry.transitMinutes).toBeNull();
  });

  it('measures an address on foot when that is what the user asked for', async () => {
    state.addressesByUser.u1 = [address({ mode: 'walk' })];

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.streetCalls[0].mode).toBe('walk');
    expect(state.saved[0].entries[0].walkMinutes).toBe(15);
    expect(state.saved[0].entries[0].carMinutes).toBeNull();
  });

  it('mixes modes across addresses without asking twice for either', async () => {
    state.addressesByUser.u1 = [address({ label: 'Home' }), address({ label: 'Work', mode: 'car' })];

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.reachabilityCalls).toHaveLength(1);
    expect(state.streetCalls).toHaveLength(1);

    const byLabel = Object.fromEntries(state.saved[0].entries.map((e) => [e.label, e]));
    expect(byLabel.Home.transitMinutes).toBeGreaterThan(0);
    expect(byLabel.Work.carMinutes).toBe(15);
  });

  it('leaves a listing due when the street budget ran out, without blaming it', async () => {
    state.settings.travelTimeStreetLookupsPerRun = 0;
    state.addressesByUser.u1 = [address({ mode: 'car' })];

    const { run } = await loadSweeper();
    await run({ now: NOW });

    // Nothing was asked, so nothing is known: no failure, and no timestamp that would hide the
    // listing for the whole refresh window.
    expect(state.streetCalls).toHaveLength(0);
    expect(state.failures).toEqual([]);
    expect(state.saved).toHaveLength(0);
  });

  it('keeps what it did learn when only some addresses were deferred', async () => {
    state.settings.travelTimeStreetLookupsPerRun = 0;
    state.addressesByUser.u1 = [address({ label: 'Home' }), address({ label: 'Work', mode: 'car' })];

    const { run } = await loadSweeper();
    await run({ now: NOW });

    // The transit answer is written, but without stamping the listing done.
    expect(state.saved[0].entries.map((e) => e.label)).toEqual(['Home']);
    expect(state.saved[0].stamp).toBe(false);
  });

  it('redoes an estimate when the address switches mode', async () => {
    state.stored.set('l1', [storedRow({ estimate_mode: 'transit' })]);
    state.addressesByUser.u1 = [address({ mode: 'car' })];

    const { run } = await loadSweeper();
    await run({ now: NOW });

    // A driving time is a different question, so the transit estimate cannot answer it.
    expect(state.streetCalls).toHaveLength(1);
    expect(state.saved[0].entries[0].carMinutes).toBe(15);
  });

  it('never routes to the failed-geocode marker', async () => {
    state.due = [{ id: 'l1', latitude: -1, longitude: -1, job_id: 'j1', user_id: 'u1' }];

    const { updateForListings } = await loadSweeper();

    expect(await updateForListings(state.due, [address()], { now: NOW })).toBe(0);
    expect(state.reachabilityCalls).toHaveLength(0);
  });

  it('stamps a listing whose owner has no addresses, so it leaves the queue', async () => {
    state.addressesByUser.u1 = [];

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.reachabilityCalls).toHaveLength(0);
    expect(state.saved).toEqual([{ listingId: 'l1', entries: [], stamp: true }]);
  });
});

describe('refineTravelTimesForListing', () => {
  const listing = { id: 'l1', latitude: LAT, longitude: LNG };

  it('asks for the real journey and stores it as exact', async () => {
    state.planResult = {
      ok: true,
      times: {
        transit: { minutes: 31, transfers: 1 },
        car: { minutes: 12, distanceMeters: 5400, geometry: 'abc' },
        bike: { minutes: 26 },
        walk: { minutes: 70 },
      },
    };

    const { refine } = await loadSweeper();
    expect(await refine(listing, [address()], { now: NOW })).toBe(true);

    const [entry] = state.saved[0].entries;
    expect(entry.isEstimate).toBe(false);
    expect(entry.carMinutes).toBe(12);
    expect(entry.carGeometry).toBe('abc');
    expect(state.planCalls).toHaveLength(1);
  });

  it('does not ask again for a listing that is already exact', async () => {
    state.stored.set('l1', [
      storedRow({
        is_estimate: 0,
        transit_legs: JSON.stringify([{ mode: 'METRO', line: 'U6', to: 'Hauptbahnhof', geometry: 'abc' }]),
        reference_time: new Date(2026, 7, 4, 8, 0, 0).getTime(),
      }),
    ]);

    const { refine } = await loadSweeper();
    await refine(listing, [address()], { now: NOW });

    expect(state.planCalls).toHaveLength(0);
  });

  it('asks again for an exact row that cannot name its stops', async () => {
    // Legs stored before the stop names were kept: a journey the UI cannot describe.
    state.stored.set('l1', [
      storedRow({
        is_estimate: 0,
        transit_legs: JSON.stringify([{ mode: 'METRO', line: 'U6', geometry: 'abc' }]),
      }),
    ]);

    const { refine } = await loadSweeper();
    await refine(listing, [address()], { now: NOW });

    expect(state.planCalls).toHaveLength(1);
  });

  it('leaves an exact row that already names its stops alone', async () => {
    state.stored.set('l1', [
      storedRow({
        is_estimate: 0,
        transit_legs: JSON.stringify([{ mode: 'METRO', line: 'U6', to: 'Hauptbahnhof', geometry: 'abc' }]),
      }),
    ]);

    const { refine } = await loadSweeper();
    await refine(listing, [address()], { now: NOW });

    expect(state.planCalls).toHaveLength(0);
  });

  it('records the mode the address is measured in, so the card keeps leading with it', async () => {
    state.planResult = {
      ok: true,
      times: { transit: { minutes: 31, transfers: 1 }, car: { minutes: 12, distanceMeters: 5400, geometry: 'abc' } },
    };

    const { refine } = await loadSweeper();
    await refine(listing, [address(), address({ label: 'Office', mode: 'car' })], { now: NOW });

    const [home, office] = state.saved[0].entries;
    expect(home.estimateMode).toBe('transit');
    expect(office.estimateMode).toBe('car');
  });

  it('keeps the estimated transit time when the planner finds no connection', async () => {
    // The sweep reached the listing by public transport; the planner has no itinerary for this one
    // departure. Blanking the transit time here is what dropped the listing out of the public
    // transport filter as soon as somebody opened it.
    state.stored.set('l1', [storedRow()]);
    state.planResult = { ok: true, times: { transit: null, car: { minutes: 12, distanceMeters: 5400 } } };

    const { refine } = await loadSweeper();
    await refine(listing, [address()], { now: NOW });

    const [entry] = state.saved[0].entries;
    expect(entry.transitMinutes).toBe(25);
    expect(entry.transitTransfers).toBe(1);
    expect(entry.carMinutes).toBe(12);
    // Still a guess, and still able to say which stops it was made from.
    expect(entry.isEstimate).toBe(true);
    expect(entry.viaStops).toHaveLength(1);
  });

  it('writes no transit time when there was no estimate to keep either', async () => {
    state.planResult = { ok: true, times: { transit: null, car: { minutes: 12, distanceMeters: 5400 } } };

    const { refine } = await loadSweeper();
    await refine(listing, [address()], { now: NOW });

    const [entry] = state.saved[0].entries;
    expect(entry.transitMinutes).toBeNull();
    expect(entry.isEstimate).toBe(false);
  });

  it('keeps the stored estimate when the exact lookup is unavailable', async () => {
    state.stored.set('l1', [storedRow()]);
    state.planResult = { ok: false, reason: 'unavailable' };

    const { refine } = await loadSweeper();
    await refine(listing, [address()], { now: NOW });

    const [entry] = state.saved[0].entries;
    expect(entry.transitMinutes).toBe(25);
    expect(entry.isEstimate).toBe(true);
  });
});

describe('updateTravelTimesForListings', () => {
  it('costs no request per listing, which is what keeps notifications cheap', async () => {
    const listings = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, latitude: LAT, longitude: LNG }));

    const { updateForListings } = await loadSweeper();
    const updated = await updateForListings(listings, [address()], { now: NOW });

    expect(updated).toBe(10);
    expect(state.reachabilityCalls).toHaveLength(1);
    expect(state.planCalls).toHaveLength(0);
  });

  it('does nothing at all when there are no addresses to measure from', async () => {
    const { updateForListings } = await loadSweeper();

    expect(await updateForListings([{ id: 'n1', latitude: LAT, longitude: LNG }], [], { now: NOW })).toBe(0);
    expect(state.reachabilityCalls).toHaveLength(0);
  });
});

describe('place types', () => {
  it('measures a category entry, which has no coordinates of its own', async () => {
    state.addressesByUser = { u1: [placeType()] };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    const [entry] = state.saved[0].entries;
    expect(entry.label).toBe('Groceries');
    expect(entry.walkMinutes).toBe(7);
    // The reachability query is for named addresses. A place type must not trigger one.
    expect(state.reachabilityCalls).toHaveLength(0);
  });

  it('records which place was actually found, so the listing can show its working', async () => {
    state.addressesByUser = { u1: [placeType()] };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    const [entry] = state.saved[0].entries;
    // Index 1, the routing winner, not index 0, the nearest as the crow flies.
    expect(entry.originName).toBe('Rewe');
    expect(entry.originLng).toBeCloseTo(LNG + 0.004, 5);
    expect(entry.originRef).toBe('supermarket');
  });

  it('is not an estimate, because it came from a real routing', async () => {
    state.addressesByUser = { u1: [placeType()] };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    // Which is what stops commuteBudget giving it the fifteen percent of slack an estimate gets.
    expect(state.saved[0].entries[0].isEstimate).toBe(false);
  });

  it('asks once for two place types measured the same way', async () => {
    state.addressesByUser = {
      u1: [placeType(), placeType({ label: 'Bread', category: 'bakery' })],
    };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    // Two shortlists, one round trip: the endpoint answers positionally, so they travel together.
    expect(state.matrixCalls).toHaveLength(1);
    expect(state.matrixCalls[0].groups.map((group) => group.label)).toEqual(['Groceries', 'Bread']);
    expect(state.saved[0].entries).toHaveLength(2);
  });

  it('keeps two public transport place types apart when they leave at different times', async () => {
    state.addressesByUser = {
      u1: [
        placeType({ mode: 'transit', departure: { time: '08:00' } }),
        placeType({ label: 'Gym', category: 'gym', mode: 'transit', departure: { time: '18:00' } }),
      ],
    };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    // The morning and the evening are not one question, so merging them would answer one of them
    // with the other's timetable.
    expect(state.matrixCalls).toHaveLength(2);
  });

  it('re-measures a label whose category changed', async () => {
    state.stored.set('l1', [
      storedRow({ label: 'Groceries', origin_ref: 'bakery', estimate_mode: 'walk', is_estimate: 0 }),
    ]);
    state.addressesByUser = { u1: [placeType()] };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.matrixCalls).toHaveLength(1);
    expect(state.saved[0].entries[0].originRef).toBe('supermarket');
  });

  it('leaves a still-valid place row alone', async () => {
    state.stored.set('l1', [
      storedRow({
        label: 'Groceries',
        origin_ref: 'supermarket',
        origin_name: 'Rewe',
        estimate_mode: 'walk',
        is_estimate: 0,
        walk_minutes: 7,
        transit_minutes: null,
        reference_time: new Date(2026, 7, 4, 8, 0, 0).getTime(),
      }),
    ]);
    state.addressesByUser = { u1: [placeType()] };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.matrixCalls).toHaveLength(0);
    expect(state.poiCalls).toHaveLength(0);
    expect(state.saved[0].entries[0].originName).toBe('Rewe');
  });

  it('writes an empty row when there is genuinely nothing of that kind nearby', async () => {
    state.placesByCategory = { supermarket: [] };
    state.addressesByUser = { u1: [placeType()] };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    const [entry] = state.saved[0].entries;
    // Nothing invented, and no travel time - but the row exists, which is what stops the listing
    // being asked again on every single run.
    expect(entry.walkMinutes).toBeNull();
    expect(entry.originLat).toBe(-1);
    expect(state.saved[0].stamp).toBe(true);
    expect(state.failures).toHaveLength(0);
  });

  it('defers rather than records nothing when the lookup failed', async () => {
    state.placesByCategory = { supermarket: null };
    state.addressesByUser = { u1: [placeType()] };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    // An outage says nothing about this listing, so it must not be counted against it.
    expect(state.failures).toHaveLength(0);
  });

  it('spends no budget while Overpass is asking to be left alone', async () => {
    state.overpassPaused = true;
    state.addressesByUser = { u1: [placeType()] };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.poiCalls).toHaveLength(0);
    expect(state.matrixCalls).toHaveLength(0);
    // Nothing was asked, so nothing is written and the listing is never stamped - which is exactly
    // what leaves it at the front of the queue for the next run.
    expect(state.saved).toHaveLength(0);
  });

  it('stops at the per-run budget and leaves the rest due', async () => {
    state.settings.poiLookupsPerRun = 2;
    state.due = Array.from({ length: 5 }, (_, i) => ({
      id: `l${i}`,
      latitude: LAT,
      longitude: LNG,
      job_id: 'j1',
      user_id: 'u1',
    }));
    state.addressesByUser = { u1: [placeType()] };

    const { run } = await loadSweeper();
    const result = await run({ now: NOW });

    expect(state.matrixCalls).toHaveLength(2);
    expect(result.placeLookups).toBe(2);
  });

  it('counts one unit of budget per listing however many place types it has', async () => {
    state.settings.poiLookupsPerRun = 1;
    state.addressesByUser = {
      u1: [placeType(), placeType({ label: 'Bread', category: 'bakery' })],
    };

    const { run } = await loadSweeper();
    const result = await run({ now: NOW });

    expect(result.placeLookups).toBe(1);
    expect(state.saved[0].entries).toHaveLength(2);
  });

  it('carries a place row through the detail page without asking for a journey plan', async () => {
    state.stored.set('l1', [
      storedRow({
        label: 'Groceries',
        origin_ref: 'supermarket',
        origin_name: 'Rewe',
        estimate_mode: 'walk',
        is_estimate: 0,
      }),
    ]);

    const { refine } = await loadSweeper();
    await refine({ id: 'l1', latitude: LAT, longitude: LNG }, [placeType()], { now: NOW });

    // Already exact, and there is no fixed address to plan a journey to in any case.
    expect(state.planCalls).toHaveLength(0);
    expect(state.saved[0].entries[0].originName).toBe('Rewe');
  });
});

describe('place types switched off', () => {
  it('asks nothing and writes no place row', async () => {
    state.settings.poiEnabled = false;
    state.addressesByUser = { u1: [placeType()] };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    expect(state.poiCalls).toHaveLength(0);
    expect(state.matrixCalls).toHaveLength(0);
  });

  it('stamps the listing rather than deferring it forever', async () => {
    state.settings.poiEnabled = false;
    state.addressesByUser = { u1: [address(), placeType()] };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    // Deferring is for work that could not be done yet. A switched-off feature is a decision, and
    // treating it as a deferral would hold every listing with a place type at the front of the
    // queue forever, starving the addresses that can still be measured.
    expect(state.saved[0].stamp).toBe(true);
    expect(state.saved[0].entries.map((entry) => entry.label)).toEqual(['Home']);
  });

  it('spends no budget, so the sweep reports none used', async () => {
    state.settings.poiEnabled = false;
    state.addressesByUser = { u1: [placeType()] };

    const { run } = await loadSweeper();
    const result = await run({ now: NOW });

    expect(result.placeLookups).toBe(0);
  });

  it('leaves what is already stored alone rather than deleting it', async () => {
    state.settings.poiEnabled = false;
    state.stored.set('l1', [
      storedRow({
        label: 'Groceries',
        origin_ref: 'supermarket',
        origin_name: 'Rewe',
        estimate_mode: 'walk',
        is_estimate: 0,
        walk_minutes: 7,
        transit_minutes: null,
        reference_time: new Date(2026, 7, 4, 8, 0, 0).getTime(),
      }),
    ]);
    state.addressesByUser = { u1: [address(), placeType()] };

    const { run } = await loadSweeper();
    await run({ now: NOW });

    // Still valid, so it is carried over by the normal path before the off switch is ever reached.
    // Switching the feature off must not throw away answers already paid for.
    expect(state.saved[0].entries.find((entry) => entry.label === 'Groceries')?.originName).toBe('Rewe');
  });
});
