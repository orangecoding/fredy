/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { formatEuroPrice } from '../price/priceService.js';

/**
 * Reading the price per square metre a listing carries, and how it compares to the area.
 *
 * The server writes four columns onto every listing: the quotient itself, the median it was
 * measured against, how many listings that median came from, and how far out they were. Turning
 * those into a verdict is arithmetic, and it happens here so a chip, a table row and the detail
 * page cannot arrive at three different answers about the same listing.
 *
 * `MARKET_BAND_PCT`, `deviationPercent` and `marketVerdict` are duplicated from
 * lib/services/listings/marketBenchmark.js. The frontend must not import out of lib/ - that code is
 * server-side and free to grow a Node built-in at any time, which would break the Vite build with
 * an error pointing nowhere near the cause. test/ui/marketBenchmarkCopyInSync.test.js fails if the
 * copies drift apart.
 */

/**
 * How far a price per square metre may sit from the local median and still count as ordinary.
 * @type {number}
 */
export const MARKET_BAND_PCT = 5;

/**
 * Above this a price per square metre is a purchase rather than a rent, and prints without cents.
 *
 * Frontend only. Two decimals are the whole point of the figure at 12,40 EUR/m² and noise at
 * 4.812,67 EUR/m², where nobody reads past the thousands.
 * @type {number}
 */
const WHOLE_EURO_ABOVE = 100;

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

/**
 * How far a price per square metre sits from the local median, in percent.
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
 * Everything a listing knows about its price per square metre, in one object.
 *
 * Two independent halves, and either can be missing on its own. A listing with a price and a size
 * always has a quotient; whether it also has something to compare that quotient against depends on
 * how many listings Fredy has seen nearby, which is nothing to do with the listing itself.
 *
 * @param {Object|null|undefined} listing A row as the listings API returns it.
 * @returns {{pricePerSqm: number, median: number|null, sampleSize: number|null, radiusKm: number|null,
 *   percent: number|null, verdict: ('below'|'inline'|'above'|null)}|null}
 *   `null` when the listing has no price per square metre at all, which is the case for anything
 *   the provider did not state a size for.
 */
export function readMarketBenchmark(listing) {
  const value = toNumber(listing?.price_per_sqm);
  if (value == null || value <= 0) {
    return null;
  }
  const median = toNumber(listing?.market_median_sqm);
  const percent = deviationPercent(value, median);
  return {
    pricePerSqm: value,
    median,
    sampleSize: toNumber(listing?.market_sample_size),
    radiusKm: toNumber(listing?.market_radius_km),
    percent,
    verdict: marketVerdict(percent),
  };
}

/**
 * A price per square metre the way the reader's language writes one.
 *
 * @param {number} value
 * @param {string} locale BCP 47 locale, from `useLocale()`.
 * @returns {string} e.g. `12,40 €/m²`.
 */
export function formatPricePerSqm(value, locale) {
  const parsed = toNumber(value);
  if (parsed == null) {
    return '';
  }
  // Two decimals below the threshold whether or not the value happens to have any, so a column of
  // rents reads as one kind of number. Above it, whole euros: nobody compares purchase prices per
  // square metre to the cent.
  const whole = parsed >= WHOLE_EURO_ABOVE;
  const rounded = whole ? Math.round(parsed) : Math.round(parsed * 100) / 100;
  return `${formatEuroPrice(rounded, locale, whole ? 0 : 2)}/m²`;
}

/**
 * The deviation as a percentage, e.g. `-18 %`.
 *
 * Written in the reader's language, because it sits inside the same badge as the price per square
 * metre next to it. A German `10,36 €/m²` beside an English `-28.4 %` is one figure written two
 * ways, half a centimetre apart.
 *
 * @param {number} percent
 * @param {string} locale BCP 47 locale, from `useLocale()`.
 * @param {boolean} [signed=true] Whether a value above the median is prefixed with a plus. The
 *   badge needs the sign, because on its own "18 %" says nothing about the direction. A sentence
 *   that already says "cheaper" or "dearer" does not, and "+18 % dearer" reads as a stutter.
 * @returns {string}
 */
export function formatDeviation(percent, locale, signed = true) {
  const parsed = toNumber(percent);
  if (parsed == null) {
    return '';
  }
  // One decimal only where it says something. "-18,0 %" reads as a precision the median does not
  // have, and every second listing would carry a trailing zero.
  const rounded = Math.round(parsed * 10) / 10;
  const shown = new Intl.NumberFormat(locale || 'de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(rounded);
  return `${signed && rounded > 0 ? '+' : ''}${shown} %`;
}
