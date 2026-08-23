/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  packMobile,
  filterMask,
  TECHNOLOGIES,
  OPERATOR_CODES,
  NEUTRAL_BITS,
  OPERATOR_BITS,
} from '../../../lib/services/connectivity/mobileBits.js';

/**
 * Mobile coverage packed into one integer, so the listings overview can filter on it in SQL.
 *
 * The thing worth asserting is that the packing and the filter agree: they are written apart from
 * each other, and a disagreement would not throw - it would quietly return the wrong listings.
 */
describe('services/connectivity/mobileBits', () => {
  it('gives every technology and operator a bit of its own', () => {
    const bits = [
      ...Object.values(NEUTRAL_BITS),
      ...OPERATOR_CODES.flatMap((code) => Object.values(OPERATOR_BITS[code])),
    ];

    expect(new Set(bits).size).toBe(bits.length);
    // Beyond 31 bits the bitwise operators start dealing in negative numbers, and SQLite would be
    // comparing something other than what was stored.
    expect(Math.max(...bits)).toBeLessThan(2 ** 31);
  });

  it('matches every combination it packed', () => {
    for (const code of OPERATOR_CODES) {
      for (const tech of TECHNOLOGIES) {
        const mask = packMobile({ operators: { [code]: { [tech]: true } } });

        expect(mask & filterMask(tech, code)).not.toBe(0);
        expect(mask & filterMask(tech)).not.toBe(0);
      }
    }
  });

  it('does not answer for an operator that is not there', () => {
    // The point of the per-operator bits: "5G at Telekom" must not match a cell where only
    // Vodafone has it, however tempting an OR with the neutral bit would be.
    const mask = packMobile({ operators: { vf: { '5g': true } } });

    expect(mask & filterMask('5g', 'dt')).toBe(0);
    expect(mask & filterMask('5g', 'vf')).not.toBe(0);
  });

  it('lets a source that only counts coverage answer the plain question', () => {
    // Switzerland reports that somebody covers the square without saying who.
    const mask = packMobile({ neutral: { '4g': true } });

    expect(mask & filterMask('4g')).not.toBe(0);
    expect(mask & filterMask('4g', 'dt')).toBe(0);
  });

  it('packs nothing to nothing', () => {
    expect(packMobile(null)).toBe(0);
    expect(packMobile({})).toBe(0);
    expect(packMobile({ neutral: { '5g': false }, operators: { dt: { '5g': false } } })).toBe(0);
  });

  it('refuses to build a mask for something it has no bit for', () => {
    // A zero mask is what keeps a hand-edited query string from filtering on a bit that means
    // something else; the query treats it as "no filter".
    expect(filterMask('6g')).toBe(0);
    expect(filterMask('5g', 'nonesuch')).toBe(0);
  });
});
