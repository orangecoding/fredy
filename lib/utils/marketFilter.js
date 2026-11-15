/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { COMMUTE_ACTIONS, DEFAULT_COMMUTE_ACTION } from './commuteBudget.js';
import { deviationPercent, grossYieldPercent } from '../services/listings/marketBenchmark.js';

/**
 * What a job expects of the market around a listing, and what that is allowed to do to it.
 *
 * Fredy already works out what a square metre costs around every listing, and for a purchase what
 * it rents for. Both were only ever shown. Somebody buying to let does not want to hear about every
 * flat in the area, only about the ones priced under it or the ones the rent would pay for.
 *
 * The same three rules as the commute filter, for the same reason:
 *
 * 1. A job without a target behaves exactly as it did before.
 * 2. A listing with no benchmark always passes. Too few neighbours is missing knowledge, not an
 *    expensive flat.
 * 3. The job says what happens to a listing that misses, with the same three actions.
 */

/** Upper bound for either target. Beyond it the number is a typo rather than an expectation. */
const MAX_PERCENT = 100;

/**
 * @typedef {Object} MarketFilter
 * @property {'mark'|'notify'|'exclude'} action What happens to a listing that misses a target.
 * @property {number} [minBelowMarketPercent] How far under the local median the price per square
 *   metre has to be, in percent.
 * @property {number} [minYieldPercent] The gross yield a purchase has to reach, in percent a year.
 */

/**
 * One target, in percent with at most one decimal.
 *
 * @param {unknown} value
 * @returns {number|null} `null` for anything absent, zero, negative, unparseable or above 100.
 */
function normalizePercent(value) {
  if (value == null || value === '' || typeof value === 'boolean') {
    return null;
  }
  const percent = Math.round(Number(value) * 10) / 10;
  return Number.isFinite(percent) && percent > 0 && percent <= MAX_PERCENT ? percent : null;
}

/**
 * A job's stored market filter, reduced to something safe to act on.
 *
 * @param {unknown} raw - As stored on the job, or as posted by a client.
 * @returns {MarketFilter|null} `null` for a filter with no target, which is the same as having none.
 */
export function normalizeMarketFilter(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const minBelowMarketPercent = normalizePercent(raw.minBelowMarketPercent);
  const minYieldPercent = normalizePercent(raw.minYieldPercent);
  if (minBelowMarketPercent == null && minYieldPercent == null) {
    return null;
  }
  /** @type {MarketFilter} */
  const filter = { action: COMMUTE_ACTIONS.includes(raw.action) ? raw.action : DEFAULT_COMMUTE_ACTION };
  if (minBelowMarketPercent != null) filter.minBelowMarketPercent = minBelowMarketPercent;
  if (minYieldPercent != null) filter.minYieldPercent = minYieldPercent;
  return filter;
}

/**
 * Whether a listing misses something this job asked of the market.
 *
 * Every target is a requirement, so one miss is enough. A target whose figure does not exist for
 * this listing is not judged at all.
 *
 * @param {{price_per_sqm?: number|null, market_median_sqm?: number|null, rent_median_sqm?: number|null}} listing
 * @param {MarketFilter|null} filter From {@link normalizeMarketFilter}.
 * @returns {boolean} `true` only when a target applies, its figure exists, and the figure misses it.
 */
export function missesMarketTarget(listing, filter) {
  if (filter == null || listing == null) {
    return false;
  }
  if (filter.minBelowMarketPercent != null) {
    const deviation = deviationPercent(listing.price_per_sqm, listing.market_median_sqm);
    if (deviation != null && deviation > -filter.minBelowMarketPercent) {
      return true;
    }
  }
  if (filter.minYieldPercent != null) {
    const yieldPercent = grossYieldPercent(listing.price_per_sqm, listing.rent_median_sqm);
    if (yieldPercent != null && yieldPercent < filter.minYieldPercent) {
      return true;
    }
  }
  return false;
}

/**
 * A job's own smallest price change worth a notification.
 *
 * @param {unknown} value
 * @returns {number|null} A percentage from 0 to 50, or `null` for "use the instance value".
 */
export function normalizePriceChangeThreshold(value) {
  if (value == null || value === '' || typeof value === 'boolean') {
    return null;
  }
  const percent = Number(value);
  return Number.isFinite(percent) && percent >= 0 && percent <= 50 ? percent : null;
}
