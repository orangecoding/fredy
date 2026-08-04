/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/services/transit/transitousClient.js', () => ({
  fetchOneToAll: vi.fn(),
}));

import { fetchOneToAll } from '../../lib/services/transit/transitousClient.js';
import { clearTransitCache } from '../../lib/services/transit/transitCache.js';
import { estimateTransitTime, getReachableStops } from '../../lib/services/transit/reachabilityService.js';

/** Berlin, Unter den Linden. Every offset below is measured from here. */
const LAT = 52.517;
const LNG = 13.3888;

/**
 * A coordinate a given distance due north, for building stops at a known walking distance.
 *
 * @param {number} meters
 * @returns {{lat: number, lng: number}}
 */
function north(meters) {
  return { lat: LAT + meters / 111320, lng: LNG };
}

beforeEach(() => {
  clearTransitCache();
  vi.mocked(fetchOneToAll).mockReset();
});

describe('estimateTransitTime', () => {
  it('adds the walk from the stop to the door', () => {
    // 400 m away: 400 * 1.3 / 80 is about 6.5 minutes on foot, on top of 20 by train.
    const stops = [{ ...north(400), minutes: 20, transfers: 1 }];
    const estimate = estimateTransitTime(stops, LAT, LNG);

    expect(estimate.transfers).toBe(1);
    expect(estimate.minutes).toBeGreaterThanOrEqual(26);
    expect(estimate.minutes).toBeLessThanOrEqual(27);
  });

  it('prefers a slightly further stop on a much quicker line', () => {
    const stops = [
      { ...north(100), minutes: 40, transfers: 2 },
      { ...north(600), minutes: 20, transfers: 0 },
    ];

    // The near stop totals ~41.6 minutes, the far one ~29.8. Nearest is not best.
    const best = estimateTransitTime(stops, LAT, LNG);
    expect(best.minutes).toBe(30);
    expect(best.transfers).toBe(0);
  });

  it('shows its working, best candidate first', () => {
    const stops = [
      { name: 'Nah', ...north(100), minutes: 40, transfers: 2 },
      { name: 'Schnell', ...north(600), minutes: 20, transfers: 0 },
    ];

    // An estimate nobody can check is an estimate nobody should trust, so the stops it was worked
    // out from travel with it.
    expect(estimateTransitTime(stops, LAT, LNG).via.map((v) => v.name)).toEqual(['Schnell', 'Nah']);
  });

  it('does not repeat one station once per platform', () => {
    const stops = [
      { name: 'Hauptbahnhof', ...north(100), minutes: 20, transfers: 0 },
      { name: 'Hauptbahnhof', ...north(140), minutes: 21, transfers: 0 },
      { name: 'Rathaus', ...north(300), minutes: 25, transfers: 1 },
    ];

    expect(estimateTransitTime(stops, LAT, LNG).via.map((v) => v.name)).toEqual(['Hauptbahnhof', 'Rathaus']);
  });

  it('ignores stops nobody would walk from', () => {
    const stops = [{ ...north(5000), minutes: 5, transfers: 0 }];

    expect(estimateTransitTime(stops, LAT, LNG)).toBeNull();
  });

  it('reports nothing rather than guessing when there is nothing to work from', () => {
    expect(estimateTransitTime([], LAT, LNG)).toBeNull();
    expect(estimateTransitTime(null, LAT, LNG)).toBeNull();
  });
});

describe('getReachableStops', () => {
  const origin = { lat: LAT, lng: LNG, referenceTime: 1785305000000 };

  it('asks once per origin however many listings are measured against it', async () => {
    vi.mocked(fetchOneToAll).mockResolvedValue([{ ...north(200), minutes: 10, transfers: 0 }]);

    const stops = await getReachableStops(origin);
    await getReachableStops(origin);
    await getReachableStops(origin);

    expect(fetchOneToAll).toHaveBeenCalledTimes(1);
    // This is the whole point of the design: three lookups, one request, and the answer is good
    // for every listing in the region rather than for one journey.
    expect(estimateTransitTime(stops, LAT, LNG)).not.toBeNull();
  });

  it('does not serve a narrower answer for a wider question', async () => {
    vi.mocked(fetchOneToAll).mockResolvedValue([]);

    await getReachableStops({ ...origin, maxTravelMinutes: 30 });
    await getReachableStops({ ...origin, maxTravelMinutes: 90 });

    expect(fetchOneToAll).toHaveBeenCalledTimes(2);
  });

  it('passes the failure through instead of pretending nothing is reachable', async () => {
    vi.mocked(fetchOneToAll).mockResolvedValue(null);

    expect(await getReachableStops(origin)).toBeNull();
  });
});
