/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/services/transit/transitousClient.js', () => ({
  fetchNearbyStops: vi.fn(),
  fetchDepartures: vi.fn(),
  fetchPlan: vi.fn(),
}));

import { fetchNearbyStops, fetchDepartures, fetchPlan } from '../../lib/services/transit/transitousClient.js';
import {
  getNearbyStops,
  getDepartures,
  getJourney,
  resolveStop,
  clearTransitCache,
} from '../../lib/services/transit/transitService.js';

/** Berlin, Unter den Linden - the coordinate every case looks up. */
const LAT = 52.517;
const LNG = 13.3888;

const STOPS = [
  { id: 'far', name: 'Staatsoper (Berlin)', lat: 52.51746, lng: 13.394303 },
  { id: 'near', name: 'U Unter den Linden (Berlin)', lat: 52.516994, lng: 13.388876 },
  { id: 'middle', name: 'Berlin, Dorotheenstr./Friedrichstr.', lat: 52.51859, lng: 13.387344 },
];

const stopTime = (overrides = {}) => ({
  mode: 'SUBWAY',
  routeShortName: 'U6',
  headsign: 'U Alt-Mariendorf',
  routeColor: '8c6dab',
  place: { scheduledDeparture: '2026-07-31T15:38:00Z', departure: '2026-07-31T15:38:00Z' },
  ...overrides,
});

beforeEach(() => {
  clearTransitCache();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('transitService', () => {
  describe('getNearbyStops', () => {
    it('sorts by distance, annotates it and applies the limit', async () => {
      fetchNearbyStops.mockResolvedValue(STOPS);

      const stops = await getNearbyStops(LAT, LNG, 2);

      expect(stops.map((stop) => stop.id)).toEqual(['near', 'middle']);
      expect(stops[0].distance).toBeLessThan(10);
      expect(stops[1].distance).toBeGreaterThan(stops[0].distance);
    });

    it('serves a second lookup of the same place from the cache', async () => {
      fetchNearbyStops.mockResolvedValue(STOPS);

      await getNearbyStops(LAT, LNG, 1);
      await getNearbyStops(LAT, LNG, 3);

      expect(fetchNearbyStops).toHaveBeenCalledTimes(1);
    });

    it('collapses concurrent lookups of the same place into one upstream call', async () => {
      let release;
      fetchNearbyStops.mockImplementation(() => new Promise((resolve) => (release = () => resolve(STOPS))));

      const both = Promise.all([getNearbyStops(LAT, LNG), getNearbyStops(LAT, LNG)]);
      release();
      const [first, second] = await both;

      expect(fetchNearbyStops).toHaveBeenCalledTimes(1);
      expect(first).toEqual(second);
    });

    it('retries soon after an empty answer instead of caching it for a day', async () => {
      vi.useFakeTimers();
      fetchNearbyStops.mockResolvedValue([]);

      expect(await getNearbyStops(LAT, LNG)).toEqual([]);
      vi.advanceTimersByTime(61 * 1000);
      fetchNearbyStops.mockResolvedValue(STOPS);

      expect((await getNearbyStops(LAT, LNG)).map((stop) => stop.id)).toEqual(['near', 'middle', 'far']);
      expect(fetchNearbyStops).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveStop', () => {
    it('prefers the stop whose name matches the one on the map', async () => {
      fetchNearbyStops.mockResolvedValue(STOPS);

      // "U Unter den Linden" from the tiles, "U Unter den Linden (Berlin)" from the timetable.
      const stop = await resolveStop(52.5175, 13.3945, 'U Unter den Linden');

      expect(stop.id).toBe('near');
    });

    it('falls back to the closest stop when no name matches', async () => {
      fetchNearbyStops.mockResolvedValue(STOPS);

      const stop = await resolveStop(LAT, LNG, 'Somewhere else entirely');

      expect(stop.id).toBe('near');
    });

    it('returns null when nothing is nearby', async () => {
      fetchNearbyStops.mockResolvedValue([]);

      expect(await resolveStop(LAT, LNG, 'Nowhere')).toBeNull();
    });
  });

  describe('getDepartures', () => {
    it('normalizes an upstream stop time', async () => {
      fetchDepartures.mockResolvedValue({
        stop: { id: 'near', name: 'U Unter den Linden (Berlin)' },
        stopTimes: [stopTime()],
      });

      const board = await getDepartures({ stopId: 'near' });

      expect(board.stop).toEqual({ id: 'near', name: 'U Unter den Linden (Berlin)' });
      expect(board.departures).toEqual([
        {
          mode: 'SUBWAY',
          line: 'U6',
          headsign: 'U Alt-Mariendorf',
          time: '2026-07-31T15:38:00Z',
          scheduledTime: '2026-07-31T15:38:00Z',
          delay: 0,
          realTime: false,
          color: '#8c6dab',
        },
      ]);
    });

    it('reports the delay in minutes and keeps the realtime flag', async () => {
      fetchDepartures.mockResolvedValue({
        stop: null,
        stopTimes: [
          stopTime({
            place: {
              scheduledDeparture: '2026-07-31T15:38:00Z',
              departure: '2026-07-31T15:41:00Z',
              realTime: true,
            },
          }),
        ],
      });

      const [departure] = (await getDepartures({ stopId: 'near' })).departures;

      expect(departure.delay).toBe(3);
      expect(departure.realTime).toBe(true);
    });

    it('drops entries without a departure time', async () => {
      fetchDepartures.mockResolvedValue({ stop: null, stopTimes: [stopTime({ place: {} }), stopTime()] });

      expect((await getDepartures({ stopId: 'near' })).departures).toHaveLength(1);
    });

    it('resolves the stop from coordinates when no id is given', async () => {
      fetchNearbyStops.mockResolvedValue(STOPS);
      fetchDepartures.mockResolvedValue({ stop: null, stopTimes: [] });

      const board = await getDepartures({ lat: LAT, lng: LNG, name: 'U Unter den Linden' });

      expect(fetchDepartures).toHaveBeenCalledWith('near', 8);
      expect(board.stop.id).toBe('near');
      // Resolved by coordinates, so the caller also learns how far away it is.
      expect(board.stop.distance).toBeGreaterThanOrEqual(0);
    });

    it('returns null when neither an id nor coordinates are given', async () => {
      expect(await getDepartures({})).toBeNull();
      expect(fetchDepartures).not.toHaveBeenCalled();
    });

    it('returns null when the upstream lookup failed', async () => {
      fetchDepartures.mockResolvedValue(null);

      expect(await getDepartures({ stopId: 'near' })).toBeNull();
    });

    it('caches a board briefly but refetches once it went stale', async () => {
      vi.useFakeTimers();
      fetchDepartures.mockResolvedValue({ stop: null, stopTimes: [stopTime()] });

      await getDepartures({ stopId: 'near' });
      await getDepartures({ stopId: 'near' });
      expect(fetchDepartures).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(31 * 1000);
      await getDepartures({ stopId: 'near' });
      expect(fetchDepartures).toHaveBeenCalledTimes(2);
    });
  });

  describe('getJourney', () => {
    const itinerary = (overrides = {}) => ({
      duration: 1440,
      legs: [
        { mode: 'WALK', duration: 300 },
        { mode: 'SUBWAY', routeShortName: 'U6', duration: 840 },
        { mode: 'WALK', duration: 300 },
      ],
      ...overrides,
    });

    it('normalizes duration to minutes and derives transfers from transit legs', async () => {
      fetchPlan.mockResolvedValue([itinerary()]);

      const journey = await getJourney(52.5, 13.4, 52.52, 13.41);

      expect(journey.durationMinutes).toBe(24);
      expect(journey.transfers).toBe(0);
      expect(journey.legs).toEqual([
        { mode: 'WALK', line: '', durationMinutes: 5 },
        { mode: 'SUBWAY', line: 'U6', durationMinutes: 14 },
        { mode: 'WALK', line: '', durationMinutes: 5 },
      ]);
    });

    it('uses the upstream transfer count when present', async () => {
      fetchPlan.mockResolvedValue([itinerary({ transfers: 2 })]);

      expect((await getJourney(52.5, 13.4, 52.52, 13.41)).transfers).toBe(2);
    });

    it('returns null when no itinerary was found', async () => {
      fetchPlan.mockResolvedValue([]);

      expect(await getJourney(52.5, 13.4, 52.52, 13.41)).toBeNull();
    });

    it('returns null when the upstream lookup failed', async () => {
      fetchPlan.mockResolvedValue(null);

      expect(await getJourney(52.5, 13.4, 52.52, 13.41)).toBeNull();
    });

    it('serves a second lookup of the same pair from the cache', async () => {
      fetchPlan.mockResolvedValue([itinerary()]);

      await getJourney(52.5, 13.4, 52.52, 13.41);
      await getJourney(52.5, 13.4, 52.52, 13.41);

      expect(fetchPlan).toHaveBeenCalledTimes(1);
    });
  });
});
