/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { toWebMercator } from '../../../lib/services/connectivity/client/breitbandatlasAtClient.js';

/**
 * Putting a coordinate where the Austrian register expects it.
 *
 * The backend takes no projection parameter: `x` and `y` are Web Mercator metres, and a pair of
 * degrees sent as-is lands a few hundred metres off the coast of Ghana. Nothing about the answer
 * says so - the register replies with an empty cell, exactly as it would for a farm in the Alps -
 * so the projection is the one part of this client that cannot be caught by reading a response.
 */
describe('services/connectivity/breitbandatlasAtClient', () => {
  it('projects a Viennese address onto the cell the register answers for', () => {
    // Stephansdom. The figures are what the map's own tile grid uses for the same point.
    const { x, y } = toWebMercator(48.2085, 16.3738);

    expect(x).toBeCloseTo(1822723.08, 1);
    expect(y).toBeCloseTo(6141612.17, 1);
  });

  it('keeps west and south negative', () => {
    const { x, y } = toWebMercator(-33.87, -70.66);

    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
  });

  it('puts the origin at the origin', () => {
    const { x, y } = toWebMercator(0, 0);

    expect(x).toBe(0);
    // Not exactly zero: the projection goes through a logarithm and a tangent, and comes back a
    // fraction of a nanometre out. A hundred-metre cell does not notice.
    expect(y).toBeCloseTo(0, 6);
  });

  it('answers a finite number for a latitude no geocoder should have produced', () => {
    // The projection runs to infinity at the poles. A geocoder that returned one of them should
    // cost an empty cell, not an `Infinity` pasted into a query string.
    const { y } = toWebMercator(90, 16.37);

    expect(Number.isFinite(y)).toBe(true);
  });
});
