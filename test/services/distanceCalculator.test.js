/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { distancesToAddresses } from '../../lib/services/listings/distanceCalculator.js';

describe('distancesToAddresses', () => {
  const home = { label: 'Home', address: 'A', coords: { lat: 52.52, lng: 13.405 } };
  const work = { label: 'Work', address: 'B', coords: { lat: 52.5, lng: 13.4 } };

  it('returns one labelled distance per configured address', () => {
    const result = distancesToAddresses(52.51, 13.4, [home, work]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.label)).toEqual(['Home', 'Work']);
    result.forEach((r) => expect(r.meters).toBeGreaterThan(0));
  });

  it('is zero meters when the listing sits on an address', () => {
    const [r] = distancesToAddresses(home.coords.lat, home.coords.lng, [home]);
    expect(r.meters).toBe(0);
  });

  it('skips addresses that failed to geocode (-1 sentinel)', () => {
    const bad = { label: 'Bad', address: 'C', coords: { lat: -1, lng: -1 } };
    const result = distancesToAddresses(52.51, 13.4, [home, bad]);
    expect(result.map((r) => r.label)).toEqual(['Home']);
  });

  it('returns an empty array for no addresses', () => {
    expect(distancesToAddresses(52.51, 13.4, [])).toEqual([]);
    expect(distancesToAddresses(52.51, 13.4, undefined)).toEqual([]);
  });
});
