/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  MARKET_BAND_PCT as backendBand,
  deviationPercent as backendDeviation,
  marketVerdict as backendVerdict,
} from '../../lib/services/listings/marketBenchmark.js';
import {
  MARKET_BAND_PCT as frontendBand,
  deviationPercent as frontendDeviation,
  marketVerdict as frontendVerdict,
} from '../../ui/src/services/listings/marketBenchmark.js';

/**
 * The frontend may not import out of lib/ - a lint rule enforces it, because server code is free to
 * grow a Node built-in and break the Vite build far from the cause. So the deviation and the band
 * around it are written twice, and this is what stops the copies drifting.
 *
 * Drift here is not cosmetic. The server decides what counts as below or above the local median
 * when it stores the numbers a filter would read; the badge decides it again when it paints a
 * listing green or red. Two different bands means a card that contradicts the data behind it.
 */
const PAIRS = [
  [8.2, 10],
  [10, 10],
  [12, 10],
  [9.5, 10],
  [10.5, 10],
  // Exactly on both edges of the band.
  [9.5, 10],
  [10.5, 10],
  [4235.67, 3980],
  [0.01, 10],
  // Neither half usable, in every shape a SQLite NULL arrives in.
  [null, 10],
  [undefined, 10],
  [10, null],
  [10, 0],
  [10, -5],
  ['', 10],
  ['auf Anfrage', 10],
];

describe('the market benchmark stays in sync between the frontend copy and lib/', () => {
  it('agrees on the band', () => {
    expect(frontendBand).toBe(backendBand);
  });

  it.each(PAIRS)('agrees on the deviation of %s from %s', (value, median) => {
    expect(frontendDeviation(value, median)).toBe(backendDeviation(value, median));
  });

  it.each(PAIRS)('agrees on the verdict for %s against %s', (value, median) => {
    const percent = backendDeviation(value, median);
    expect(frontendVerdict(percent)).toBe(backendVerdict(percent));
  });

  it('actually classifies rather than answering null throughout', () => {
    // A copy that returned null for everything would pass every equality check above only if the
    // original did too. This is what makes the agreement meaningful.
    expect(frontendVerdict(frontendDeviation(8.2, 10))).toBe('below');
    expect(frontendVerdict(frontendDeviation(10, 10))).toBe('inline');
    expect(frontendVerdict(frontendDeviation(12, 10))).toBe('above');
  });

  it('does not read a missing figure as a hundred percent below the market', () => {
    // Number(null) is 0, so a bare coercion turns a listing with no price per square metre into
    // the best bargain on the page. Both copies have to refuse it.
    expect(backendDeviation(null, 10)).toBeNull();
    expect(frontendDeviation(null, 10)).toBeNull();
    expect(backendVerdict(null)).toBeNull();
    expect(frontendVerdict(null)).toBeNull();
  });
});
