/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Where the map is allowed to go, per country.
 *
 * `maxBounds` used to be Germany, full stop, which is right up until a provider covers somewhere
 * else and the user cannot pan far enough to draw a search area around it. The box for a set of
 * countries is the union of their boxes rather than their outlines: turn on a German provider and a
 * French one and the result also covers Belgium. That is fine. `maxBounds` exists to stop a stray
 * drag throwing the map into the Atlantic, it is not a filter, and sealing it to national borders
 * would cost more than it returns.
 *
 * Boxes are `[[west, south], [east, north]]`, as MapLibre wants them, and are approximate on
 * purpose - they are outer limits, not geometry. Mainland only: the French and Spanish overseas
 * territories and the Danish north Atlantic would each stretch their country's box across an ocean
 * and take the union with them.
 *
 * @type {Object.<string, [[number, number], [number, number]]>}
 */
export const COUNTRY_BOUNDS = {
  at: [
    [9.53, 46.37],
    [17.16, 49.02],
  ],
  be: [
    [2.51, 49.49],
    [6.41, 51.51],
  ],
  ch: [
    [5.95, 45.81],
    [10.49, 47.81],
  ],
  cz: [
    [12.09, 48.55],
    [18.86, 51.06],
  ],
  de: [
    [5.866, 47.27],
    [15.042, 55.059],
  ],
  dk: [
    [8.07, 54.55],
    [15.16, 57.76],
  ],
  es: [
    [-9.39, 35.94],
    [4.6, 43.75],
  ],
  fr: [
    [-5.15, 41.33],
    [9.56, 51.09],
  ],
  it: [
    [6.62, 35.49],
    [18.53, 47.1],
  ],
  lu: [
    [5.73, 49.44],
    [6.54, 50.19],
  ],
  nl: [
    [3.35, 50.75],
    [7.23, 53.56],
  ],
  pl: [
    [14.12, 49.0],
    [24.15, 54.84],
  ],
};

/**
 * What the map covers when nothing says otherwise, mirroring the server's own default.
 *
 * Module scope so its identity is stable: it is the default of a prop an effect depends on, and a
 * fresh `['de']` per render would re-run that effect forever.
 *
 * @type {readonly string[]}
 */
export const DEFAULT_COUNTRIES = Object.freeze(['de']);

/**
 * The German box, which is what an undeclared provider resolves to.
 *
 * @type {[[number, number], [number, number]]}
 */
export const GERMANY_BOUNDS = COUNTRY_BOUNDS.de;

/**
 * The box enclosing every country given.
 *
 * Unknown codes are skipped rather than widening the box, and a list of nothing but unknowns falls
 * back to Germany - the same answer an absent `countries` declaration gives on the server.
 *
 * @param {string[]} [countries] - ISO 3166-1 alpha-2 codes.
 * @returns {[[number, number], [number, number]]} `[[west, south], [east, north]]`.
 */
export function boundsForCountries(countries) {
  const boxes = (Array.isArray(countries) ? countries : [])
    .map((code) => COUNTRY_BOUNDS[String(code).toLowerCase()])
    .filter((box) => box != null);

  if (boxes.length === 0) {
    return GERMANY_BOUNDS;
  }

  return boxes.reduce((acc, [[west, south], [east, north]]) => [
    [Math.min(acc[0][0], west), Math.min(acc[0][1], south)],
    [Math.max(acc[1][0], east), Math.max(acc[1][1], north)],
  ]);
}
