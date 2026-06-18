/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDirectRoute, getTransitRoute, getAllRoutes, MODES } from '../../lib/services/routing/transitousClient.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

function makeResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 429 ? 'Too Many Requests' : 'Error',
    json: async () => body,
  };
}

const directBody = (mode, duration, distance) => ({
  direct: [
    {
      duration,
      legs: [{ mode, duration, distance }],
    },
  ],
  itineraries: [],
});

const transitBody = (duration, transfers) => ({
  direct: [],
  itineraries: [{ duration, transfers, legs: [] }],
});

describe('#transitousClient getDirectRoute()', () => {
  it('returns duration and distance for WALK', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(directBody('WALK', 600, 450)));

    const result = await getDirectRoute(47.376, 8.541, 47.369, 8.539, MODES.WALKING);

    expect(result.duration).toBe(600);
    expect(result.distance).toBe(450);
  });

  it('returns duration and distance for BIKE', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(directBody('BIKE', 360, 1350)));

    const result = await getDirectRoute(47.376, 8.541, 47.369, 8.539, MODES.CYCLING);

    expect(result.duration).toBe(360);
    expect(result.distance).toBe(1350);
  });

  it('returns duration and distance for CAR', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(directBody('CAR', 665, 1720)));

    const result = await getDirectRoute(47.376, 8.541, 47.369, 8.539, MODES.DRIVING);

    expect(result.duration).toBe(665);
    expect(result.distance).toBe(1720);
  });

  it('uses latitude,longitude order in URL (MOTIS order)', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(directBody('WALK', 600, 450)));

    const startLat = 47.376;
    const startLng = 8.541;
    await getDirectRoute(startLat, startLng, 47.369, 8.539, MODES.WALKING);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain(`fromPlace=${startLat},${startLng}`);
  });

  it('passes directModes in URL', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(directBody('BIKE', 360, 1350)));

    await getDirectRoute(47.376, 8.541, 47.369, 8.539, MODES.CYCLING);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('directModes=BIKE');
  });

  it('throws with rate-limit message on 429', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 429));

    await expect(getDirectRoute(47.376, 8.541, 47.369, 8.539, MODES.WALKING)).rejects.toThrow('rate limit');
  });

  it('throws on non-OK responses', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

    await expect(getDirectRoute(47.376, 8.541, 47.369, 8.539, MODES.WALKING)).rejects.toThrow(
      'Transitous API error: 500',
    );
  });

  it('throws when direct array is empty', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ direct: [], itineraries: [] }));

    await expect(getDirectRoute(47.376, 8.541, 47.369, 8.539, MODES.WALKING)).rejects.toThrow(
      'unexpected response shape',
    );
  });
});

describe('#transitousClient getTransitRoute()', () => {
  it('returns duration and transfers', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(transitBody(900, 1)));

    const result = await getTransitRoute(47.376, 8.541, 47.369, 8.539);

    expect(result.duration).toBe(900);
    expect(result.transfers).toBe(1);
  });

  it('passes transportModes=TRANSIT,WALK in URL', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(transitBody(900, 0)));

    await getTransitRoute(47.376, 8.541, 47.369, 8.539);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('transportModes=TRANSIT,WALK');
  });

  it('throws when no itinerary found', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ direct: [], itineraries: [] }));

    await expect(getTransitRoute(47.376, 8.541, 47.369, 8.539)).rejects.toThrow('No transit connection found.');
  });

  it('throws with rate-limit message on 429', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 429));

    await expect(getTransitRoute(47.376, 8.541, 47.369, 8.539)).rejects.toThrow('rate limit');
  });
});

describe('#transitousClient getAllRoutes()', () => {
  it('returns results for all four modes', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(directBody('WALK', 600, 450)))
      .mockResolvedValueOnce(makeResponse(directBody('BIKE', 360, 1350)))
      .mockResolvedValueOnce(makeResponse(directBody('CAR', 665, 1720)))
      .mockResolvedValueOnce(makeResponse(transitBody(900, 1)));

    const result = await getAllRoutes(47.376, 8.541, 47.369, 8.539);

    expect(result[MODES.WALKING]).toMatchObject({ duration: 600, distance: 450 });
    expect(result[MODES.CYCLING]).toMatchObject({ duration: 360, distance: 1350 });
    expect(result[MODES.DRIVING]).toMatchObject({ duration: 665, distance: 1720 });
    expect(result[MODES.TRANSIT]).toMatchObject({ duration: 900, transfers: 1 });
  });

  it('returns null for a mode that fails, keeps others', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(directBody('WALK', 600, 450)))
      .mockResolvedValueOnce(makeResponse({}, 500))
      .mockResolvedValueOnce(makeResponse(directBody('CAR', 665, 1720)))
      .mockResolvedValueOnce(makeResponse(transitBody(900, 0)));

    const result = await getAllRoutes(47.376, 8.541, 47.369, 8.539);

    expect(result[MODES.WALKING]).not.toBeNull();
    expect(result[MODES.CYCLING]).toBeNull();
    expect(result[MODES.DRIVING]).not.toBeNull();
    expect(result[MODES.TRANSIT]).not.toBeNull();
  });

  it('falls back to haversine estimate when WALK API returns no route', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({ direct: [], itineraries: [] })) // WALK → no route
      .mockResolvedValueOnce(makeResponse(directBody('BIKE', 360, 1350)))
      .mockResolvedValueOnce(makeResponse(directBody('CAR', 665, 1720)))
      .mockResolvedValueOnce(makeResponse(transitBody(900, 0)));

    const result = await getAllRoutes(47.376, 8.541, 47.369, 8.539);

    expect(result[MODES.WALKING]).not.toBeNull();
    expect(result[MODES.WALKING].estimated).toBe(true);
    expect(result[MODES.WALKING].duration).toBeGreaterThan(0);
    expect(result[MODES.WALKING].distance).toBeGreaterThan(0);
  });

  it('returns null for transit when no connection exists', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(directBody('WALK', 600, 450)))
      .mockResolvedValueOnce(makeResponse(directBody('BIKE', 360, 1350)))
      .mockResolvedValueOnce(makeResponse(directBody('CAR', 665, 1720)))
      .mockResolvedValueOnce(makeResponse({ direct: [], itineraries: [] }));

    const result = await getAllRoutes(47.376, 8.541, 47.369, 8.539);

    expect(result[MODES.TRANSIT]).toBeNull();
    expect(result[MODES.WALKING]).not.toBeNull();
  });
});
