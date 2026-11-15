/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { COMMUTE_ACTIONS, DEFAULT_COMMUTE_ACTION } from './commuteFilter.js';

/**
 * The shape of a job's market filter, as the browser needs to know it.
 *
 * A copy of the halves of `lib/utils/marketFilter.js` the form and the badge need, for the reason
 * `commuteFilter.js` is one: the frontend may not reach into server code. The server normalises
 * again on the way in. The actions are the commute filter's, on purpose: the two filters ask the
 * same question about a listing that falls short.
 */

/** The targets a market filter can carry, in the order the form shows them. */
export const MARKET_TARGETS = ['minBelowMarketPercent', 'minYieldPercent'];

/**
 * What a typed target means once it leaves the field.
 *
 * @param {unknown} value
 * @returns {number|null} A percentage above 0 and up to 100 with one decimal, or `null` for an
 *   empty or unusable field, which reads as "not checked".
 */
export function toMarketPercent(value) {
  if (value == null || value === '' || typeof value === 'boolean') {
    return null;
  }
  const percent = Math.round(Number(value) * 10) / 10;
  return Number.isFinite(percent) && percent > 0 && percent <= 100 ? percent : null;
}

/**
 * How many targets a filter sets.
 *
 * @param {Object|null|undefined} marketFilter
 * @returns {number}
 */
export function countMarketTargets(marketFilter) {
  return MARKET_TARGETS.filter((key) => toMarketPercent(marketFilter?.[key]) != null).length;
}

/**
 * The filter a form holds after one of its fields changed.
 *
 * @param {Object|null|undefined} current
 * @param {Object} change - The fields that changed.
 * @returns {{action: string, minBelowMarketPercent?: number, minYieldPercent?: number}|null} `null`
 *   once nothing is set and the action is the default, so an emptied form really does clear.
 */
export function withMarketChange(current, change) {
  const merged = { ...current, ...change };
  const action = COMMUTE_ACTIONS.includes(merged.action) ? merged.action : DEFAULT_COMMUTE_ACTION;
  const next = { action };
  for (const key of MARKET_TARGETS) {
    const percent = toMarketPercent(merged[key]);
    if (percent != null) next[key] = percent;
  }
  return countMarketTargets(next) === 0 && action === DEFAULT_COMMUTE_ACTION ? null : next;
}

/**
 * Whether a listing misses something its job asked of the market.
 *
 * @param {{percent: number|null, yieldPercent: number|null}|null} benchmark - From `readMarketBenchmark`.
 * @param {Object|null|undefined} marketFilter - As stored on the job.
 * @returns {boolean} `true` only when a target is set, its figure exists, and the figure misses it.
 */
export function missesMarketTarget(benchmark, marketFilter) {
  if (benchmark == null) {
    return false;
  }
  const below = toMarketPercent(marketFilter?.minBelowMarketPercent);
  if (below != null && benchmark.percent != null && benchmark.percent > -below) {
    return true;
  }
  const minYield = toMarketPercent(marketFilter?.minYieldPercent);
  return minYield != null && benchmark.yieldPercent != null && benchmark.yieldPercent < minYield;
}

/**
 * What a typed price change threshold means once it leaves the field.
 *
 * Zero is a real answer here, unlike for a target: it means "tell me about every change".
 *
 * @param {unknown} value
 * @returns {number|null} A percentage from 0 to 50, or `null` for "use the instance setting".
 */
export function toPriceChangeThreshold(value) {
  if (value == null || value === '' || typeof value === 'boolean') {
    return null;
  }
  const percent = Number(value);
  return Number.isFinite(percent) && percent >= 0 && percent <= 50 ? percent : null;
}
