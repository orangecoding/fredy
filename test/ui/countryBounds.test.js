/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  boundsForCountries,
  COUNTRY_BOUNDS,
  DEFAULT_COUNTRIES,
  GERMANY_BOUNDS,
} from '../../ui/src/components/map/countryBounds.js';

/**
 * How far the map may be panned.
 *
 * `maxBounds` was Germany and nothing else, so a job using a provider covering somewhere else could
 * not be given a search area: the user simply could not pan there. What replaces it has to keep
 * answering with exactly the German box for everything Fredy ships with today.
 */
describe('boundsForCountries', () => {
  it('is the German box for the default', () => {
    expect(boundsForCountries(DEFAULT_COUNTRIES)).toEqual(GERMANY_BOUNDS);
  });

  it('is the German box when asked about nothing at all', () => {
    expect(boundsForCountries([])).toEqual(GERMANY_BOUNDS);
    expect(boundsForCountries(undefined)).toEqual(GERMANY_BOUNDS);
    expect(boundsForCountries(null)).toEqual(GERMANY_BOUNDS);
  });

  // A code the table has never heard of must not silently widen the map to the whole planet, and
  // must not shrink it to nothing either.
  it('is the German box for a code it does not know', () => {
    expect(boundsForCountries(['xx'])).toEqual(GERMANY_BOUNDS);
  });

  it('ignores an unknown code sitting next to a known one', () => {
    expect(boundsForCountries(['ch', 'xx'])).toEqual(COUNTRY_BOUNDS.ch);
  });

  it('reads a code whatever case it arrives in', () => {
    expect(boundsForCountries(['CH'])).toEqual(COUNTRY_BOUNDS.ch);
  });

  /**
   * The union deliberately covers ground neither country does - Germany plus France also takes in
   * Belgium. `maxBounds` stops a stray drag throwing the map into the Atlantic; it is not a filter,
   * and following national borders would cost far more than it returns.
   */
  it('encloses every country given', () => {
    const [[west, south], [east, north]] = boundsForCountries(['de', 'fr']);

    expect(west).toBe(COUNTRY_BOUNDS.fr[0][0]);
    expect(south).toBe(COUNTRY_BOUNDS.fr[0][1]);
    expect(east).toBe(COUNTRY_BOUNDS.de[1][0]);
    expect(north).toBe(COUNTRY_BOUNDS.de[1][1]);
  });

  it('does not mutate the table it reads', () => {
    const before = JSON.stringify(COUNTRY_BOUNDS);
    boundsForCountries(['de', 'fr', 'it']);

    expect(JSON.stringify(COUNTRY_BOUNDS)).toBe(before);
  });
});

describe('the bounding box table', () => {
  it('keys every entry by a lowercase alpha-2 code', () => {
    for (const code of Object.keys(COUNTRY_BOUNDS)) {
      expect(code).toMatch(/^[a-z]{2}$/);
    }
  });

  it('puts the south-west corner first and the north-east second', () => {
    for (const [code, [[west, south], [east, north]]] of Object.entries(COUNTRY_BOUNDS)) {
      expect(west, `${code} west`).toBeLessThan(east);
      expect(south, `${code} south`).toBeLessThan(north);
      expect(Math.abs(west), `${code} longitude`).toBeLessThanOrEqual(180);
      expect(Math.abs(north), `${code} latitude`).toBeLessThanOrEqual(90);
    }
  });
});
