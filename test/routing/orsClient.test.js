/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDirections, getAllDirections, PROFILES } from '../../lib/services/routing/orsClient.js';

const API_KEY = 'test-ors-key';

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

const successBody = {
  features: [{ properties: { summary: { duration: 754.3, distance: 1823.6 } } }],
};

describe('#orsClient getDirections()', () => {
  it('returns duration and distance on successful response', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(successBody));

    const result = await getDirections(6.5668, 46.5191, 6.5622, 46.5198, PROFILES.WALKING, API_KEY);

    expect(result.duration).toBe(754.3);
    expect(result.distance).toBe(1823.6);
  });

  it('includes the profile in the request URL', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(successBody));

    await getDirections(6.5668, 46.5191, 6.5622, 46.5198, PROFILES.CYCLING, API_KEY);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('cycling-regular');
  });

  it('uses longitude,latitude order (GeoJSON) in URL', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(successBody));

    const startLng = 6.5668;
    const startLat = 46.5191;
    const endLng = 6.5622;
    const endLat = 46.5198;

    await getDirections(startLng, startLat, endLng, endLat, PROFILES.DRIVING, API_KEY);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain(`start=${startLng},${startLat}`);
    expect(url).toContain(`end=${endLng},${endLat}`);
  });

  it('includes the api_key in the request URL', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(successBody));

    await getDirections(6.5668, 46.5191, 6.5622, 46.5198, PROFILES.WALKING, API_KEY);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain(`api_key=${API_KEY}`);
  });

  it('throws with a rate-limit message on 429', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 429));

    await expect(getDirections(0, 0, 1, 1, PROFILES.WALKING, API_KEY)).rejects.toThrow('rate limit');
  });

  it('throws on non-OK responses', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}, 403));

    await expect(getDirections(0, 0, 1, 1, PROFILES.WALKING, API_KEY)).rejects.toThrow('ORS API error: 403');
  });

  it('throws when response shape is unexpected', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ unexpected: true }));

    await expect(getDirections(0, 0, 1, 1, PROFILES.WALKING, API_KEY)).rejects.toThrow('unexpected response shape');
  });
});

describe('#orsClient getAllDirections()', () => {
  it('returns results for all three profiles', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(successBody))
      .mockResolvedValueOnce(makeResponse(successBody))
      .mockResolvedValueOnce(makeResponse(successBody));

    const result = await getAllDirections(6.5668, 46.5191, 6.5622, 46.5198, API_KEY);

    expect(result[PROFILES.WALKING]).toMatchObject({ duration: 754.3, distance: 1823.6 });
    expect(result[PROFILES.CYCLING]).toMatchObject({ duration: 754.3, distance: 1823.6 });
    expect(result[PROFILES.DRIVING]).toMatchObject({ duration: 754.3, distance: 1823.6 });
  });

  it('returns null for a profile that fails, keeps others', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(successBody))
      .mockResolvedValueOnce(makeResponse({}, 500))
      .mockResolvedValueOnce(makeResponse(successBody));

    const result = await getAllDirections(0, 0, 1, 1, API_KEY);

    expect(result[PROFILES.WALKING]).not.toBeNull();
    expect(result[PROFILES.CYCLING]).toBeNull();
    expect(result[PROFILES.DRIVING]).not.toBeNull();
  });
});
