/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../lib/services/storage/listingsStorage.js', () => ({
  getGeocoordinatesByAddress: vi.fn(() => null),
}));
vi.mock('../../../lib/services/providers/providerCountries.js', () => ({
  getProviderIdsForCountries: vi.fn(async () => []),
}));

const NOT_FOUND = { lat: -1, lng: -1 };
const geocodeMock = vi.fn();
vi.mock('../../../lib/services/geocoding/client/nominatimClient.js', () => ({
  geocode: geocodeMock,
  isPaused: () => false,
}));

const { geocodeAddress } = await import('../../../lib/services/geocoding/geoCodingService.js');

/** The addresses handed to the geocoder, in order. */
const asked = () => geocodeMock.mock.calls.map((call) => call[0]);

beforeEach(() => {
  geocodeMock.mockReset();
});

/**
 * Retrying an address that Nominatim could not find, without the trailing parenthesis.
 *
 * Kleinanzeigen writes how far a listing is from the searched point into the address itself, so what
 * reaches the geocoder looks like `40217 Unterbilk (0.6 km)`. Nominatim reads that as part of the
 * place name and answers "no such place", which is not an error: the listing is stored with no
 * coordinates, no area filter can judge it and no travel time is computed. The same address without
 * the distance resolves.
 *
 * Only on an empty answer, never on one that worked. `40211 Stadtmitte (1 km)` resolves to
 * Düsseldorf as written, and to Berlin without the distance - there is a Stadtmitte in both. Since
 * `_filterByArea` deletes listings that fall outside the area, replacing a good answer with a wrong
 * one would not merely misplace a pin, it would delete the listing.
 */
describe('geocodeAddress retrying without a trailing parenthesis', () => {
  it('retries an address it could not find, without the parenthesis', async () => {
    geocodeMock.mockResolvedValueOnce(NOT_FOUND).mockResolvedValueOnce({ lat: 51.2127, lng: 6.7742 });

    await expect(geocodeAddress('40217 Unterbilk (0.6 km)', ['de'])).resolves.toEqual({
      lat: 51.2127,
      lng: 6.7742,
    });
    expect(asked()).toEqual(['40217 Unterbilk (0.6 km)', '40217 Unterbilk']);
  });

  it('leaves an address that resolved alone, so a good answer is never replaced by a worse one', async () => {
    geocodeMock.mockResolvedValueOnce({ lat: 51.2219, lng: 6.7844 });

    await expect(geocodeAddress('40211 Stadtmitte (1 km)', ['de'])).resolves.toEqual({
      lat: 51.2219,
      lng: 6.7844,
    });
    expect(asked()).toEqual(['40211 Stadtmitte (1 km)']);
  });

  it('reports not found when the retry cannot find it either', async () => {
    geocodeMock.mockResolvedValue(NOT_FOUND);

    await expect(geocodeAddress('Nowhere at all (2 km)', ['de'])).resolves.toEqual(NOT_FOUND);
    expect(asked()).toHaveLength(2);
  });

  it('does not retry an address with no parenthesis to drop', async () => {
    geocodeMock.mockResolvedValue(NOT_FOUND);

    await geocodeAddress('40217 Unterbilk', ['de']);
    expect(asked()).toEqual(['40217 Unterbilk']);
  });

  // A null answer means the geocoder could not be reached, or is standing off after a 429. Asking
  // again would double the requests exactly when Nominatim has said to stop.
  it('does not retry when the geocoder never answered', async () => {
    geocodeMock.mockResolvedValue(null);

    await expect(geocodeAddress('40217 Unterbilk (0.6 km)', ['de'])).resolves.toBeNull();
    expect(asked()).toEqual(['40217 Unterbilk (0.6 km)']);
  });

  it('does not retry an address that is nothing but a parenthesis', async () => {
    geocodeMock.mockResolvedValue(NOT_FOUND);

    await geocodeAddress('(0.6 km)', ['de']);
    expect(asked()).toEqual(['(0.6 km)']);
  });

  it('drops only the last parenthesis, and only at the end', async () => {
    geocodeMock.mockResolvedValueOnce(NOT_FOUND).mockResolvedValueOnce({ lat: 1, lng: 2 });

    await geocodeAddress('Musterstr. 1 (Hinterhaus), 12345 Berlin (3 km)', ['de']);
    expect(asked()[1]).toBe('Musterstr. 1 (Hinterhaus), 12345 Berlin');
  });
});
