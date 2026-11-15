/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import {
  missesMarketTarget,
  normalizeMarketFilter,
  normalizePriceChangeThreshold,
} from '../../lib/utils/marketFilter.js';
import { grossYieldPercent as backendYield } from '../../lib/services/listings/marketBenchmark.js';
import { grossYieldPercent as frontendYield } from '../../ui/src/services/listings/marketBenchmark.js';
import {
  missesMarketTarget as frontendMisses,
  toMarketPercent,
  toPriceChangeThreshold,
  withMarketChange,
} from '../../ui/src/services/jobs/marketFilter.js';

describe('normalizeMarketFilter', () => {
  it.each([null, undefined, 'x', [], {}, { action: 'exclude' }, { minBelowMarketPercent: 0 }, { minYieldPercent: -3 }])(
    'reads %j as no filter at all',
    (raw) => {
      expect(normalizeMarketFilter(raw)).toBeNull();
    },
  );

  it('defaults the action and keeps only the targets that were set', () => {
    expect(normalizeMarketFilter({ minBelowMarketPercent: '12.34' })).toEqual({
      action: 'notify',
      minBelowMarketPercent: 12.3,
    });
    expect(normalizeMarketFilter({ action: 'exclude', minYieldPercent: 4, minBelowMarketPercent: 150 })).toEqual({
      action: 'exclude',
      minYieldPercent: 4,
    });
  });
});

describe('missesMarketTarget', () => {
  const filter = { action: 'notify', minBelowMarketPercent: 10, minYieldPercent: 4 };

  it('passes a listing that meets every target', () => {
    expect(missesMarketTarget({ price_per_sqm: 3000, market_median_sqm: 4000, rent_median_sqm: 12.5 }, filter)).toBe(
      false,
    );
  });

  it('fails a listing on one missed target', () => {
    expect(missesMarketTarget({ price_per_sqm: 3900, market_median_sqm: 4000, rent_median_sqm: 20 }, filter)).toBe(
      true,
    );
    expect(missesMarketTarget({ price_per_sqm: 3000, market_median_sqm: 4000, rent_median_sqm: 5 }, filter)).toBe(true);
  });

  it('passes exactly on the target', () => {
    expect(missesMarketTarget({ price_per_sqm: 3600, market_median_sqm: 4000 }, filter)).toBe(false);
  });

  it('never fails a listing on a figure that does not exist', () => {
    expect(missesMarketTarget({ price_per_sqm: 3000 }, filter)).toBe(false);
    expect(missesMarketTarget({ price_per_sqm: null, market_median_sqm: 4000, rent_median_sqm: 1 }, filter)).toBe(
      false,
    );
    expect(missesMarketTarget({ price_per_sqm: 5000, market_median_sqm: 4000 }, null)).toBe(false);
  });
});

describe('normalizePriceChangeThreshold', () => {
  it('keeps zero, which means every change', () => {
    expect(normalizePriceChangeThreshold(0)).toBe(0);
    expect(normalizePriceChangeThreshold('2.5')).toBe(2.5);
  });

  it.each([null, undefined, '', -1, 51, 'abc', true])('reads %j as "use the instance setting"', (value) => {
    expect(normalizePriceChangeThreshold(value)).toBeNull();
  });
});

describe('the frontend copies', () => {
  it.each([
    [3000, 12.5],
    [3000, 7.5],
    [4235.67, 13.21],
    [null, 10],
    [3000, null],
    [0, 10],
    [3000, 0],
    ['', 10],
  ])('agree with the server on the yield of %s at a rent of %s', (price, rent) => {
    expect(frontendYield(price, rent)).toBe(backendYield(price, rent));
  });

  it('actually compute a yield', () => {
    expect(backendYield(3000, 12.5)).toBe(5);
  });

  it('agree with the server on what a typed number means', () => {
    for (const value of [0, 0.04, 12.34, 100, 100.1, -1, '', null, 'abc']) {
      expect(toMarketPercent(value)).toBe(normalizeMarketFilter({ minYieldPercent: value })?.minYieldPercent ?? null);
      expect(toPriceChangeThreshold(value)).toBe(normalizePriceChangeThreshold(value));
    }
  });

  it('agree with the server on which listing misses', () => {
    const filter = { action: 'mark', minBelowMarketPercent: 10, minYieldPercent: 4 };
    expect(frontendMisses({ percent: -5, yieldPercent: 6 }, filter)).toBe(true);
    expect(frontendMisses({ percent: -10, yieldPercent: 4 }, filter)).toBe(false);
    expect(frontendMisses({ percent: null, yieldPercent: null }, filter)).toBe(false);
  });

  it('clear the filter once the last target is emptied', () => {
    expect(withMarketChange({ action: 'notify', minYieldPercent: 4 }, { minYieldPercent: '' })).toBeNull();
    expect(withMarketChange({ action: 'exclude', minYieldPercent: 4 }, { minYieldPercent: '' })).toEqual({
      action: 'exclude',
    });
    expect(withMarketChange(null, { minBelowMarketPercent: 10 })).toEqual({
      action: 'notify',
      minBelowMarketPercent: 10,
    });
  });
});
