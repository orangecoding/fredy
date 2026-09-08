/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { distanceMeters } from './distanceCalculator.js';

/**
 * What a square metre costs, and what it costs everywhere else nearby.
 *
 * Price alone says nothing. Nine hundred euros is a bargain for eighty square metres in Munich and
 * daylight robbery for thirty in Chemnitz, and the number every German listing is actually judged
 * by is the quotient. Fredy already stores both halves as numbers, so the quotient is free.
 *
 * The second half is the comparison. Fredy has been collecting listings for as long as it has been
 * running, which is a price sample for the exact area the user is searching in - better than any
 * published Mietspiegel for the purpose, because it is the same portals, the same week and the same
 * kind of flat. This module turns that sample into one median per listing.
 *
 * Everything here is pure. The SQL lives in the constant below and is handed to whichever executor
 * the caller has: the storage layer passes the shared connection, the migration passes the raw
 * `better-sqlite3` handle it is given. One implementation, two callers, no duplicated query.
 */

/**
 * Smallest living space that may produce a price per square metre.
 *
 * Portals write "1" into the size field often enough to matter - a parking space, a parsing miss,
 * a listing that only quotes the plot. Dividing by it produces a number in the thousands for a
 * rental, which then poisons every median computed around it.
 *
 * @type {number}
 */
export const MIN_SIZE_SQM = 5;

/**
 * How many comparable listings a median needs before it is worth showing.
 *
 * Under this the figure says more about which three flats happened to be listed last week than
 * about the area, and a confident looking "22 % below market" built on two neighbours is worse
 * than no figure at all.
 *
 * @type {number}
 */
export const MIN_SAMPLE = 8;

/**
 * The radii tried, in order, until one of them holds {@link MIN_SAMPLE} listings.
 *
 * Five kilometres is a district in a city and the answer people mean by "around here". Fifteen is
 * the fallback for everywhere that is not a city, where five would return nothing at all and the
 * feature would simply never appear. The radius that was used is stored with the result, so the
 * tooltip can say which of the two the number came from rather than implying the tighter one.
 *
 * @type {number[]}
 */
export const BENCHMARK_RADII_KM = [5, 15];

/**
 * Upper bound on the rows one benchmark reads.
 *
 * In a dense city the widest radius covers thousands of listings, and reading all of them per
 * listing turns the one-off backfill into something quadratic. The cap is not a compromise on
 * accuracy: the rows are taken nearest-first, so what it drops is always the furthest and least
 * comparable part of the sample.
 *
 * @type {number}
 */
export const MAX_COMPARABLES = 300;

/**
 * How far a listing may sit from the local median and still count as an ordinary asking price.
 *
 * Portals round, landlords price on instinct and the median moves with every new listing, so
 * anything inside this band is noise rather than a finding.
 *
 * @type {number}
 */
export const MARKET_BAND_PCT = 5;

/** Metres in a kilometre. */
const METERS_PER_KM = 1000;

/**
 * A number, or nothing.
 *
 * `Number(null)` is 0 and so is `Number('')`, which is how a listing with no price per square metre
 * ends up reported as a hundred percent below the local median. Every read of a possibly absent
 * figure goes through here rather than through a bare `Number()` followed by an `isFinite` check
 * that zero passes.
 *
 * @param {*} value
 * @returns {number|null}
 */
function toNumber(value) {
  if (value == null || value === '' || typeof value === 'boolean') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Length of one degree of latitude, in kilometres. Constant everywhere. */
const KM_PER_DEGREE_LAT = 111.32;

/**
 * The comparables for one listing: everything of the same deal type inside the bounding box,
 * nearest first.
 *
 * Three restrictions carry weight:
 *
 * - `l.id != @id` keeps a listing out of the sample it is measured against. With eight neighbours
 *   its own price would pull the median by an eighth of the way towards itself, which is exactly
 *   the direction that hides an outlier.
 * - `j.deal_type = @dealType` is not optional. A purchase and a rental share the `price` column at
 *   two completely different magnitudes, and one purchase in the sample moves a rental median by
 *   orders of magnitude.
 * - `manually_deleted = 0` drops the tombstones the similarity filter and the area filter leave
 *   behind. A cross-portal duplicate is the same flat twice, and counting both would let a single
 *   listing vote twice on what the area costs.
 *
 * The ordering is a squared planar distance rather than a great circle: inside a bounding box a few
 * kilometres across the two rank identically, and this one is arithmetic SQLite can do over an
 * index scan. The exact distance is measured afterwards, in {@link computeBenchmark}, where it
 * decides the radius rather than the order.
 *
 * @type {string}
 */
export const COMPARABLES_SQL = `
  SELECT l.price     AS price,
         l.size      AS size,
         l.latitude  AS latitude,
         l.longitude AS longitude
  FROM listings l
         JOIN jobs j ON j.id = l.job_id
  WHERE l.id != @id
    AND j.deal_type = @dealType
    AND l.manually_deleted = 0
    AND l.price > 0
    AND l.size >= @minSize
    AND l.latitude BETWEEN @minLat AND @maxLat
    AND l.longitude BETWEEN @minLng AND @maxLng
  ORDER BY (l.latitude - @lat) * (l.latitude - @lat) +
           (l.longitude - @lng) * (l.longitude - @lng) * @lngWeight
  LIMIT @limit
`;

/**
 * The price of one square metre, to the cent.
 *
 * @param {number|null|undefined} price
 * @param {number|null|undefined} size Living space in square metres.
 * @returns {number|null} `null` when either half is missing, non-numeric or implausible.
 */
export function pricePerSqm(price, size) {
  const parsedPrice = toNumber(price);
  const parsedSize = toNumber(size);
  if (parsedPrice == null || parsedSize == null) {
    return null;
  }
  if (parsedPrice <= 0 || parsedSize < MIN_SIZE_SQM) {
    return null;
  }
  return Math.round((parsedPrice / parsedSize) * 100) / 100;
}

/**
 * The middle value, averaging the two middle ones for an even count.
 *
 * Median rather than mean throughout: one penthouse in a sample of terraced houses moves a mean
 * enough to make every ordinary listing around it look like a bargain.
 *
 * @param {number[]} values Unsorted is fine, the function sorts a copy.
 * @returns {number|null} `null` for an empty list.
 */
export function medianOf(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return Math.round(median * 100) / 100;
}

/**
 * How far a price per square metre sits from the local median, in percent.
 *
 * Negative means cheaper than the area, which is the direction a searcher is hoping for.
 *
 * @param {number|null|undefined} value
 * @param {number|null|undefined} median
 * @returns {number|null} Rounded to one decimal, or `null` when either side is missing.
 */
export function deviationPercent(value, median) {
  const parsedValue = toNumber(value);
  const parsedMedian = toNumber(median);
  if (parsedValue == null || parsedMedian == null || parsedMedian <= 0) {
    return null;
  }
  return Math.round(((parsedValue - parsedMedian) / parsedMedian) * 1000) / 10;
}

/**
 * Below, above, or near enough to the local median to be neither.
 *
 * @param {number|null|undefined} percent From {@link deviationPercent}.
 * @returns {('below'|'inline'|'above'|null)}
 */
export function marketVerdict(percent) {
  const value = toNumber(percent);
  if (value == null) {
    return null;
  }
  if (value <= -MARKET_BAND_PCT) {
    return 'below';
  }
  if (value >= MARKET_BAND_PCT) {
    return 'above';
  }
  return 'inline';
}

/**
 * The latitude and longitude window covering everything within `radiusKm` of a point.
 *
 * A box rather than a circle, because a box is what an index on the two columns can answer. The
 * corners it lets through are cut afterwards by the real distance, so the box is a prefilter and
 * never the definition of "nearby".
 *
 * Degrees of longitude shrink towards the poles, so the eastward half of the box is widened by the
 * cosine of the latitude. Without it a box around Hamburg would be a third too narrow.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusKm
 * @returns {{minLat: number, maxLat: number, minLng: number, maxLng: number, lngWeight: number}}
 *   `lngWeight` scales a longitude difference onto a latitude one, for the ordering in
 *   {@link COMPARABLES_SQL}.
 */
export function boundingBox(lat, lng, radiusKm) {
  const latSpan = radiusKm / KM_PER_DEGREE_LAT;
  // Never zero, and never negative: at the poles the cosine collapses and the box would become a
  // line, which would return nothing rather than everything.
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const lngSpan = latSpan / cosLat;
  return {
    minLat: lat - latSpan,
    maxLat: lat + latSpan,
    minLng: lng - lngSpan,
    maxLng: lng + lngSpan,
    lngWeight: cosLat * cosLat,
  };
}

/**
 * Whether a listing carries a position a benchmark can be built around.
 *
 * `-1/-1` is the "looked, found nothing" answer the geocoder stores, not a place, so a listing
 * carrying it has no neighbourhood to be compared with.
 *
 * @param {{latitude?: number|null, longitude?: number|null}} listing
 * @returns {boolean}
 */
export function isLocated(listing) {
  const lat = toNumber(listing?.latitude);
  const lng = toNumber(listing?.longitude);
  if (lat == null || lng == null) {
    return false;
  }
  return !(lat === -1 && lng === -1);
}

/**
 * What a square metre costs around one listing.
 *
 * Reads the widest radius once and narrows in memory, so a listing in a city centre is measured
 * against its own five kilometres while one in the countryside falls back to fifteen, and both cost
 * a single query.
 *
 * @param {{id: string, latitude: number, longitude: number}} listing The listing being measured.
 * @param {('rent'|'buy')} dealType Deal type of the job that found it.
 * @param {(sql: string, params: Object) => Array<Object>} runQuery Executor for {@link COMPARABLES_SQL}.
 * @returns {{medianPricePerSqm: number, sampleSize: number, radiusKm: number}|null}
 *   `null` when the listing has no position, the job has no deal type, or no radius reaches
 *   {@link MIN_SAMPLE} comparable listings.
 */
export function computeBenchmark(listing, dealType, runQuery) {
  if (!isLocated(listing) || dealType == null) {
    return null;
  }

  const lat = Number(listing.latitude);
  const lng = Number(listing.longitude);
  const widest = BENCHMARK_RADII_KM[BENCHMARK_RADII_KM.length - 1];
  const box = boundingBox(lat, lng, widest);

  const rows = runQuery(COMPARABLES_SQL, {
    id: listing.id,
    dealType,
    minSize: MIN_SIZE_SQM,
    minLat: box.minLat,
    maxLat: box.maxLat,
    minLng: box.minLng,
    maxLng: box.maxLng,
    lat,
    lng,
    lngWeight: box.lngWeight,
    limit: MAX_COMPARABLES,
  });

  const neighbours = [];
  for (const row of rows) {
    const value = pricePerSqm(row.price, row.size);
    if (value == null) {
      continue;
    }
    neighbours.push({
      value,
      km: distanceMeters(lat, lng, Number(row.latitude), Number(row.longitude)) / METERS_PER_KM,
    });
  }

  for (const radiusKm of BENCHMARK_RADII_KM) {
    const within = neighbours.filter((entry) => entry.km <= radiusKm).map((entry) => entry.value);
    if (within.length >= MIN_SAMPLE) {
      return { medianPricePerSqm: medianOf(within), sampleSize: within.length, radiusKm };
    }
  }
  return null;
}
