/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/services/transit/transitousClient.js', () => ({
  fetchPlan: vi.fn(),
  isTransitPaused: vi.fn(() => false),
}));

import { fetchPlan } from '../../lib/services/transit/transitousClient.js';
import { clearTransitCache } from '../../lib/services/transit/transitCache.js';
import {
  DEFAULT_DEPARTURE,
  getTravelTimes,
  normalizePlan,
  referenceDeparture,
} from '../../lib/services/transit/travelTimeService.js';

/** A direct itinerary as MOTIS returns one: a single leg carrying the mode. */
const direct = (mode, seconds, extra = {}) => ({
  duration: seconds,
  transfers: 0,
  legs: [{ mode, duration: seconds, ...extra }],
});

beforeEach(() => {
  clearTransitCache();
  vi.mocked(fetchPlan).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('referenceDeparture', () => {
  it('takes the next occurrence of the configured time', () => {
    // A Monday, nine in the morning: today's eight o'clock has been and gone.
    const now = new Date(2026, 7, 3, 9, 0, 0);
    const departure = referenceDeparture(now, { time: '08:00' });

    expect(departure.getHours()).toBe(8);
    expect(departure.getMinutes()).toBe(0);
    expect(departure.getTime()).toBeGreaterThan(now.getTime());
    // Tuesday, not a week later.
    expect(departure.getDate()).toBe(4);
  });

  it('keeps today when the time is still ahead', () => {
    const now = new Date(2026, 7, 4, 6, 0, 0);
    expect(referenceDeparture(now, { time: '08:00' }).getDate()).toBe(4);
  });

  it('never lands on a weekend, whichever day it is asked on', () => {
    // Friday evening: the next 08:00 is Saturday, which is the wrong timetable to judge a flat on.
    const friday = referenceDeparture(new Date(2026, 7, 7, 20, 0, 0), { time: '08:00' });
    expect(friday.getDay()).toBe(1);
    expect(friday.getDate()).toBe(10);

    // Asked on the Saturday itself.
    const saturday = referenceDeparture(new Date(2026, 7, 8, 6, 0, 0), { time: '08:00' });
    expect(saturday.getDay()).toBe(1);

    // And on the Sunday.
    const sunday = referenceDeparture(new Date(2026, 7, 9, 6, 0, 0), { time: '08:00' });
    expect(sunday.getDay()).toBe(1);
  });

  it('keeps the wall-clock time across a daylight saving change', () => {
    // Either side of the European clocks going back on 25 October 2026.
    const before = referenceDeparture(new Date(2026, 9, 21, 12, 0, 0), { time: '08:00' });
    const after = referenceDeparture(new Date(2026, 9, 28, 12, 0, 0), { time: '08:00' });

    expect(before.getHours()).toBe(8);
    // Same wall-clock hour on the other side of the switch, which is what a person means by "08:00".
    expect(after.getHours()).toBe(8);
  });

  it('falls back to the default for anything unusable', () => {
    const now = new Date(2026, 7, 3, 9, 0, 0);
    const fallback = referenceDeparture(now, { time: 'half eight' });

    expect(DEFAULT_DEPARTURE.time).toBe('08:00');
    expect(fallback.getHours()).toBe(8);
  });
});

describe('normalizePlan', () => {
  it('reads a duration for every direct mode that came back', () => {
    const times = normalizePlan({
      direct: [direct('CAR', 494), direct('BIKE', 1723), direct('WALK', 1824)],
      itineraries: [],
    });

    expect(times.car.minutes).toBe(8);
    expect(times.bike.minutes).toBe(29);
    expect(times.walk.minutes).toBe(30);
  });

  it('carries the road distance and the encoded route of the car leg', () => {
    const times = normalizePlan({
      direct: [direct('CAR', 183, { distance: 2335.4, legGeometry: { points: 'abc', precision: 7 } })],
      itineraries: [],
    });

    expect(times.car.distanceMeters).toBe(2335);
    expect(times.car.geometry).toBe('abc');
  });

  it('leaves out a mode that was not routable rather than calling it zero', () => {
    const times = normalizePlan({ direct: [direct('CAR', 494)], itineraries: [] });

    expect(times.car).not.toBeNull();
    expect(times.walk).toBeNull();
    expect(times.bike).toBeNull();
  });

  it('picks the fastest transit option, not the first', () => {
    const times = normalizePlan({
      direct: [],
      itineraries: [
        { duration: 2040, transfers: 0, legs: [] },
        { duration: 1920, transfers: 1, legs: [] },
        { duration: 2400, transfers: 2, legs: [] },
      ],
    });

    expect(times.transit).toMatchObject({ minutes: 32, transfers: 1 });
  });

  it('keeps the drawable legs of the journey, so the map can colour them', () => {
    const times = normalizePlan({
      direct: [],
      itineraries: [
        {
          duration: 1920,
          transfers: 1,
          legs: [
            {
              mode: 'WALK',
              duration: 600,
              // MOTIS names the ends of the whole journey START and END: the doorstep and the flat,
              // which the UI already knows about and must not print as place names.
              from: { name: 'START' },
              to: { name: 'S Hackescher Markt' },
              legGeometry: { points: 'aaa', precision: 7 },
            },
            {
              mode: 'METRO',
              duration: 120,
              routeShortName: 'S5',
              routeColor: 'eb7405',
              from: { name: 'S Hackescher Markt' },
              to: { name: 'S+U Friedrichstr.' },
              legGeometry: { points: 'bbb', precision: 7 },
            },
            { mode: 'BUS', duration: 300 },
          ],
        },
      ],
    });

    // The leg with no geometry is dropped: it cannot be drawn, and a gap is more honest than a
    // straight line pretending to be a bus route.
    expect(times.transit.legs).toEqual([
      { mode: 'WALK', line: null, color: null, from: null, to: 'S Hackescher Markt', minutes: 10, geometry: 'aaa' },
      {
        mode: 'METRO',
        line: 'S5',
        color: '#eb7405',
        from: 'S Hackescher Markt',
        to: 'S+U Friedrichstr.',
        minutes: 2,
        geometry: 'bbb',
      },
    ]);
  });

  it('reports no transit when there are no itineraries', () => {
    const times = normalizePlan({ direct: [direct('CAR', 494)], itineraries: [] });
    expect(times.transit).toBeNull();
  });

  it('returns null when nothing at all was routable', () => {
    expect(normalizePlan({ direct: [], itineraries: [] })).toBeNull();
    expect(normalizePlan(null)).toBeNull();
  });
});

describe('getTravelTimes', () => {
  const pair = { fromLat: 52.52, fromLng: 13.405, toLat: 52.516, toLng: 13.3777, referenceTime: 1785305000000 };

  it('tells an outage apart from a place that cannot be reached', async () => {
    vi.mocked(fetchPlan).mockResolvedValueOnce(null);
    expect(await getTravelTimes(pair)).toEqual({ ok: false, reason: 'unavailable' });

    clearTransitCache();
    vi.mocked(fetchPlan).mockResolvedValueOnce({ direct: [], itineraries: [] });
    expect(await getTravelTimes(pair)).toEqual({ ok: false, reason: 'unroutable' });
  });

  it('asks once for coordinates that round to the same place', async () => {
    vi.mocked(fetchPlan).mockResolvedValue({ direct: [direct('CAR', 600)], itineraries: [] });

    await getTravelTimes(pair);
    // Well inside the fifth decimal, so this is the same flat as far as routing is concerned.
    await getTravelTimes({ ...pair, toLat: pair.toLat + 0.000001 });

    expect(fetchPlan).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent asks for the same journey into one request', async () => {
    vi.mocked(fetchPlan).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ direct: [direct('CAR', 600)], itineraries: [] }), 5)),
    );

    const [first, second] = await Promise.all([getTravelTimes(pair), getTravelTimes(pair)]);

    expect(fetchPlan).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('re-asks after an outage rather than caching it for the day', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchPlan).mockResolvedValueOnce(null);
    await getTravelTimes(pair);

    vi.advanceTimersByTime(61_000);
    vi.mocked(fetchPlan).mockResolvedValueOnce({ direct: [direct('CAR', 600)], itineraries: [] });

    const result = await getTravelTimes(pair);
    expect(result.ok).toBe(true);
    expect(result.times.car.minutes).toBe(10);
    expect(fetchPlan).toHaveBeenCalledTimes(2);
  });
});
