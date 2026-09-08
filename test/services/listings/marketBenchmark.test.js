/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

import {
  BENCHMARK_RADII_KM,
  MARKET_BAND_PCT,
  MAX_COMPARABLES,
  MIN_SAMPLE,
  MIN_SIZE_SQM,
  boundingBox,
  computeBenchmark,
  deviationPercent,
  isLocated,
  marketVerdict,
  medianOf,
  pricePerSqm,
} from '../../../lib/services/listings/marketBenchmark.js';

/** Cologne cathedral, as good a centre as any. */
const LAT = 50.9413;
const LNG = 6.958;

/**
 * A point roughly `km` kilometres due north of the centre.
 *
 * North rather than east on purpose: a degree of latitude is the same length everywhere, so the
 * fixtures stay honest without having to model the cosine the bounding box applies.
 *
 * @param {number} km
 * @returns {{latitude: number, longitude: number}}
 */
function northOf(km) {
  return { latitude: LAT + km / 111.32, longitude: LNG };
}

/**
 * A comparable row as the SQL returns one.
 *
 * @param {number} km Distance from the centre.
 * @param {number} price
 * @param {number} [size=50]
 * @returns {Object}
 */
function comparable(km, price, size = 50) {
  return { price, size, ...northOf(km) };
}

describe('price per square metre', () => {
  it('divides price by living space, to the cent', () => {
    expect(pricePerSqm(1200, 75)).toBe(16);
    expect(pricePerSqm(1000, 33)).toBe(30.3);
  });

  it('refuses a size small enough to make the quotient meaningless', () => {
    // Portals write 1 into the size field for parking spaces and parse failures. A rental at
    // 900 EUR/m2 would then sit in every median around it.
    expect(pricePerSqm(900, 1)).toBeNull();
    expect(pricePerSqm(900, MIN_SIZE_SQM - 1)).toBeNull();
    expect(pricePerSqm(900, MIN_SIZE_SQM)).toBe(180);
  });

  it('refuses anything that is not two usable numbers', () => {
    expect(pricePerSqm(null, 50)).toBeNull();
    expect(pricePerSqm(1200, null)).toBeNull();
    expect(pricePerSqm('auf Anfrage', 50)).toBeNull();
    expect(pricePerSqm(0, 50)).toBeNull();
    expect(pricePerSqm(-100, 50)).toBeNull();
  });
});

describe('median', () => {
  it('takes the middle value for an odd count', () => {
    expect(medianOf([9, 1, 5])).toBe(5);
  });

  it('averages the two middle values for an even count', () => {
    expect(medianOf([1, 5, 9, 11])).toBe(7);
  });

  it('is unmoved by a single extreme value, which a mean would not be', () => {
    const ordinary = [10, 11, 12, 13, 14];
    const withPenthouse = [...ordinary, 900];
    expect(medianOf(ordinary)).toBe(12);
    expect(medianOf(withPenthouse)).toBe(12.5);
  });

  it('answers null for nothing at all', () => {
    expect(medianOf([])).toBeNull();
    expect(medianOf(null)).toBeNull();
  });
});

describe('deviation and verdict', () => {
  it('reports cheaper than the area as a negative percentage', () => {
    expect(deviationPercent(8.2, 10)).toBe(-18);
    expect(deviationPercent(12, 10)).toBe(20);
    expect(deviationPercent(10, 10)).toBe(0);
  });

  it('has no answer without both halves', () => {
    expect(deviationPercent(10, null)).toBeNull();
    expect(deviationPercent(null, 10)).toBeNull();
    expect(deviationPercent(10, 0)).toBeNull();
  });

  it('calls anything inside the band an ordinary asking price', () => {
    expect(marketVerdict(0)).toBe('inline');
    expect(marketVerdict(-(MARKET_BAND_PCT - 0.1))).toBe('inline');
    expect(marketVerdict(MARKET_BAND_PCT - 0.1)).toBe('inline');
  });

  it('calls the edges of the band by name', () => {
    expect(marketVerdict(-MARKET_BAND_PCT)).toBe('below');
    expect(marketVerdict(MARKET_BAND_PCT)).toBe('above');
    expect(marketVerdict(null)).toBeNull();
  });
});

describe('bounding box', () => {
  it('widens eastwards as the degrees of longitude shrink', () => {
    const box = boundingBox(LAT, LNG, 5);
    const latSpan = box.maxLat - box.minLat;
    const lngSpan = box.maxLng - box.minLng;
    expect(lngSpan).toBeGreaterThan(latSpan);
  });

  it('never collapses to a line at the pole', () => {
    const box = boundingBox(90, 0, 5);
    expect(box.maxLng - box.minLng).toBeGreaterThan(0);
    expect(Number.isFinite(box.lngWeight)).toBe(true);
  });
});

describe('located', () => {
  it('treats the geocoder failure marker as no position at all', () => {
    // -1/-1 is what a failed geocode stores. Benchmarking around it would compare a listing in
    // Cologne against whatever sits in the Atlantic.
    expect(isLocated({ latitude: -1, longitude: -1 })).toBe(false);
    expect(isLocated({ latitude: LAT, longitude: LNG })).toBe(true);
    expect(isLocated({ latitude: LAT })).toBe(false);
    expect(isLocated({})).toBe(false);
  });
});

describe('benchmark for one listing', () => {
  const listing = { id: 'target', latitude: LAT, longitude: LNG };

  it('takes the median of everything inside the tightest radius that has enough of it', () => {
    const rows = Array.from({ length: MIN_SAMPLE }, () => comparable(1, 500));
    const benchmark = computeBenchmark(listing, 'rent', () => rows);

    expect(benchmark).toEqual({
      medianPricePerSqm: 10,
      sampleSize: MIN_SAMPLE,
      radiusKm: BENCHMARK_RADII_KM[0],
    });
  });

  it('widens to the next radius rather than answering from too small a sample', () => {
    const rows = [
      ...Array.from({ length: MIN_SAMPLE - 1 }, () => comparable(1, 500)),
      ...Array.from({ length: MIN_SAMPLE }, () => comparable(9, 1000)),
    ];
    const benchmark = computeBenchmark(listing, 'rent', () => rows);

    expect(benchmark.radiusKm).toBe(BENCHMARK_RADII_KM[1]);
    expect(benchmark.sampleSize).toBe(MIN_SAMPLE * 2 - 1);
  });

  it('says nothing at all when even the widest radius is too thin', () => {
    const rows = Array.from({ length: MIN_SAMPLE - 1 }, () => comparable(1, 500));
    expect(computeBenchmark(listing, 'rent', () => rows)).toBeNull();
  });

  it('drops rows outside the widest radius even though the box let them through', () => {
    // The box is a square, so its corners reach further than its radius. Anything out there is
    // cut here rather than being allowed to vote on what the neighbourhood costs.
    const rows = [
      ...Array.from({ length: MIN_SAMPLE }, () => comparable(1, 500)),
      ...Array.from({ length: 20 }, () => comparable(19, 5000)),
    ];
    const benchmark = computeBenchmark(listing, 'rent', () => rows);

    expect(benchmark.sampleSize).toBe(MIN_SAMPLE);
    expect(benchmark.medianPricePerSqm).toBe(10);
  });

  it('ignores comparables whose own quotient is not usable', () => {
    const rows = [
      ...Array.from({ length: MIN_SAMPLE }, () => comparable(1, 500)),
      comparable(1, 900, 1),
      comparable(1, 0),
    ];
    const benchmark = computeBenchmark(listing, 'rent', () => rows);

    expect(benchmark.sampleSize).toBe(MIN_SAMPLE);
  });

  it('excludes the listing itself and asks for the right deal type', () => {
    const runQuery = vi.fn(() => Array.from({ length: MIN_SAMPLE }, () => comparable(1, 500)));
    computeBenchmark(listing, 'buy', runQuery);

    const [, params] = runQuery.mock.calls[0];
    expect(params.id).toBe('target');
    expect(params.dealType).toBe('buy');
    expect(params.minSize).toBe(MIN_SIZE_SQM);
    expect(params.limit).toBe(MAX_COMPARABLES);
  });

  it('reads once, at the widest radius, however many radii there are', () => {
    const runQuery = vi.fn(() => Array.from({ length: MIN_SAMPLE }, () => comparable(1, 500)));
    computeBenchmark(listing, 'rent', runQuery);

    expect(runQuery).toHaveBeenCalledTimes(1);
    const [, params] = runQuery.mock.calls[0];
    const widest = BENCHMARK_RADII_KM[BENCHMARK_RADII_KM.length - 1];
    expect(params.maxLat - params.minLat).toBeCloseTo((2 * widest) / 111.32, 4);
  });

  it('has nothing to say about a listing with no position or a job with no deal type', () => {
    const rows = Array.from({ length: MIN_SAMPLE }, () => comparable(1, 500));
    expect(computeBenchmark({ id: 'a' }, 'rent', () => rows)).toBeNull();
    expect(computeBenchmark({ id: 'a', latitude: -1, longitude: -1 }, 'rent', () => rows)).toBeNull();
    expect(computeBenchmark(listing, null, () => rows)).toBeNull();
  });
});
