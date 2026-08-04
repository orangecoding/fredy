/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { decodePolyline, MOTIS_POLYLINE_PRECISION } from '../../ui/src/views/listings/polyline.js';

describe('decodePolyline', () => {
  it('decodes the reference example from the format specification', () => {
    // The canonical Google example, encoded at five decimal places.
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);

    // GeoJSON order: [lng, lat].
    expect(points).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it('reads MOTIS geometry at seven places, which is where the route actually is', () => {
    // The opening of a real leg from api.transitous.org, starting at 52.5200013, 13.4050028.
    const [first] = decodePolyline('ygtvh^wmwt~FoFrH??wcAhnA', MOTIS_POLYLINE_PRECISION);

    expect(first[1]).toBeCloseTo(52.52, 5);
    expect(first[0]).toBeCloseTo(13.405, 5);
  });

  it('puts the route in the wrong hemisphere at the wrong precision', () => {
    // Not a curiosity: this is why the precision is a required argument rather than a default. The
    // usual polyline package assumes five, and getting it wrong fails silently.
    const [wrong] = decodePolyline('ygtvh^wmwt~FoFrH', 5);

    expect(wrong[1]).toBeGreaterThan(90);
  });

  it('returns nothing rather than throwing on unusable input', () => {
    expect(decodePolyline('', 7)).toEqual([]);
    expect(decodePolyline(null, 7)).toEqual([]);
    expect(decodePolyline('abc', undefined)).toEqual([]);
  });
});
