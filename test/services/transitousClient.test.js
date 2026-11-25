/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('node-fetch', () => ({ default: fetchMock }));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({ getSettings: async () => ({}) }));

import {
  fetchDepartures,
  fetchNearbyStops,
  fetchOneToAll,
  fetchOneToManyIntermodal,
  fetchPlan,
} from '../../lib/services/transit/transitousClient.js';

/** @param {unknown} body */
const answer = (body) => ({ ok: true, status: 200, json: async () => body });

/** The request the client sent last, as a URL. */
const lastUrl = () => new URL(fetchMock.mock.calls.at(-1)[0]);

/**
 * Stops as Transitous answers around München, Briefzentrum: the amarillo ride sharing feed puts a
 * copy on top of the tram stop, with the same coordinates and id suffix.
 */
const BRIEFZENTRUM = [
  {
    type: 'STOP',
    id: 'de-DELFI_de:09162:217',
    name: 'Briefzentrum',
    lat: 48.14911,
    lon: 11.524262,
    modes: ['TRAM'],
  },
  {
    type: 'STOP',
    id: 'de-amarillo-bw_de:09162:217',
    name: 'München, Briefzentrum',
    lat: 48.14911,
    lon: 11.524262,
    modes: ['RIDE_SHARING'],
  },
  {
    type: 'STOP',
    id: 'de-amarillo-bw_de:08421:1010',
    name: 'Ulm, Theater',
    lat: 48.4,
    lon: 9.99,
    modes: ['RIDE_SHARING', 'TRAM', 'BUS'],
  },
  { type: 'STOP', id: 'no-modes', name: 'Older instance', lat: 48.1, lon: 11.5 },
];

beforeEach(() => {
  fetchMock.mockReset();
});

describe('transitousClient and ride sharing (#537)', () => {
  it('leaves out a stop only ride sharing calls at, and keeps one it shares with buses', async () => {
    fetchMock.mockResolvedValue(answer(BRIEFZENTRUM));

    const stops = await fetchNearbyStops(48.1491, 11.5243);

    expect(stops.map((stop) => stop.name)).toEqual(['Briefzentrum', 'Ulm, Theater', 'Older instance']);
  });

  /**
   * Every query that routes over the timetable, with the parameter that carries its modes. MOTIS'
   * `TRANSIT` includes ride sharing: from Munich to Stuttgart the fastest "public transport" answer
   * was a ride offer, 117 minutes against the ICE's 142.
   */
  const TRANSIT_QUERIES = [
    {
      name: 'the departure board',
      param: 'mode',
      body: { place: { stopId: 'x', name: 'X' }, stopTimes: [] },
      run: () => fetchDepartures('de-amarillo-bw_de:08421:1022', 8),
    },
    {
      name: 'a journey plan',
      param: 'transitModes',
      body: { direct: [], itineraries: [] },
      run: () =>
        fetchPlan({ fromLat: 48.149, fromLng: 11.524, toLat: 48.776, toLng: 9.183, time: '2026-11-26T04:56:00Z' }),
    },
    {
      name: 'the reachability sweep',
      param: 'transitModes',
      body: { all: [] },
      run: () => fetchOneToAll({ lat: 48.149, lng: 11.524, time: '2026-11-26T04:56:00Z', maxTravelTime: 90 }),
    },
    {
      name: 'the place matrix',
      param: 'transitModes',
      body: { street_durations: [], transit_durations: [] },
      run: () =>
        fetchOneToManyIntermodal({
          fromLat: 48.149,
          fromLng: 11.524,
          destinations: [{ lat: 48.776, lng: 9.183 }],
          time: '2026-11-26T04:56:00Z',
          maxTravelTime: 90,
          maxDirectSeconds: 600,
        }),
    },
  ];

  it.each(TRANSIT_QUERIES)('leaves ride sharing out of $name', async ({ param, body, run }) => {
    fetchMock.mockResolvedValue(answer(body));

    await run();

    const modes = lastUrl().searchParams.get(param).split(',');
    expect(modes).not.toContain('RIDE_SHARING');
    expect(modes).not.toContain('TRANSIT');
    for (const mode of ['TRAM', 'SUBWAY', 'BUS', 'COACH', 'RAIL', 'FERRY', 'ODM']) {
      expect(modes).toContain(mode);
    }
  });

  it('keeps the board at the count it asked for, by filtering upstream', async () => {
    fetchMock.mockResolvedValue(answer({ place: { stopId: 'x', name: 'X' }, stopTimes: [] }));

    await fetchDepartures('de-amarillo-bw_de:08421:1022', 8);

    expect(lastUrl().pathname).toMatch(/\/v1\/stoptimes$/);
    expect(lastUrl().searchParams.get('n')).toBe('8');
  });
});
