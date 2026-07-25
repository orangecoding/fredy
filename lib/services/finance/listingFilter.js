/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { thresholdsFor } from './affordability.js';

/** The bands the listings overview can filter by. */
export const AFFORDABILITY_BANDS = Object.freeze(['affordable', 'stretch', 'unaffordable']);

/**
 * Normalize a user-supplied band name, ignoring anything unrecognised.
 *
 * @param {*} value
 * @returns {'affordable'|'stretch'|'unaffordable'|null}
 */
export function normalizeBand(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const lower = value.toLowerCase();
  return AFFORDABILITY_BANDS.includes(lower) ? lower : null;
}

/**
 * One deal type's slice of an affordability band.
 *
 * `min` is inclusive, `minExclusive` is not. Both exist because the two bounds mean different
 * things: `min` is the floor below which a price is not that kind of listing at all, while
 * `minExclusive` is the ceiling of the band below. Rounding the latter into an inclusive bound
 * used to lose whatever price sat in the gap, so a listing could carry a "stretch" chip and still
 * be missing from the "stretch" filter.
 *
 * @typedef {Object} AffordabilityWindow
 * @property {number|null} [min] Lowest price still in the band, inclusive.
 * @property {number|null} [minExclusive] Price the band starts strictly above.
 * @property {number|null} [max] Highest price still in the band, inclusive.
 */

/**
 * Translate an affordability band into the price windows that express it - one per deal type.
 *
 * Rent and purchase live in the same `price` column at wildly different magnitudes, so a single
 * window could never describe both. The job says which kind of listing it produced, and each
 * window is applied only to listings of that kind.
 *
 * The bounds mirror {@link import('./affordability.js').verdictForPrice} and
 * {@link import('./affordability.js').verdictForRent} exactly, so the filter and the chips can
 * never disagree about a single listing.
 *
 * Returns `null` when the band is unknown, and a side is `null` when that half of the profile is
 * incomplete. Callers treat a `null` band as "no filter" rather than "no results": a user who
 * cleared their profile and then reloads a bookmarked URL should see their listings, not an empty
 * page. A `null` side, by contrast, matches nothing on that side - there is genuinely no yardstick
 * for those listings.
 *
 * @param {'affordable'|'stretch'|'unaffordable'|string|null} band
 * @param {import('../../types/finance.js').FinanceProfile|null} profile
 * @returns {{buy: AffordabilityWindow|null, rent: AffordabilityWindow|null}|null}
 */
export function affordabilityBandFor(band, profile) {
  const normalized = normalizeBand(band);
  if (normalized == null) {
    return null;
  }

  const thresholds = thresholdsFor(profile);
  const buy = buyBand(normalized, thresholds.buy);
  const rent = rentBand(normalized, thresholds.rent);
  if (buy == null && rent == null) {
    return null;
  }
  return { buy, rent };
}

/**
 * @param {'affordable'|'stretch'|'unaffordable'} band
 * @param {{affordableMaxPrice: number, stretchMaxPrice: number, purchasePriceThreshold: number}|null} thresholds
 * @returns {AffordabilityWindow|null}
 */
function buyBand(band, thresholds) {
  if (thresholds == null) {
    return null;
  }
  const { affordableMaxPrice, stretchMaxPrice, purchasePriceThreshold } = thresholds;

  // The rental floor stays on every band, because `verdictForPrice` refuses to judge anything
  // below it. No clamping on the upper bound: when a ceiling falls below that floor the band
  // comes out empty, which is the correct answer - a household that cannot afford even the
  // cheapest purchase has an empty "affordable" bucket.
  if (band === 'affordable') {
    return { min: purchasePriceThreshold, max: affordableMaxPrice };
  }
  if (band === 'stretch') {
    return { min: purchasePriceThreshold, minExclusive: affordableMaxPrice, max: stretchMaxPrice };
  }
  return { min: purchasePriceThreshold, minExclusive: stretchMaxPrice, max: null };
}

/**
 * @param {'affordable'|'stretch'|'unaffordable'} band
 * @param {{affordableMaxRent: number, stretchMaxRent: number}|null} thresholds
 * @returns {AffordabilityWindow|null}
 */
function rentBand(band, thresholds) {
  if (thresholds == null) {
    return null;
  }
  const { affordableMaxRent, stretchMaxRent } = thresholds;

  // A rental has no lower bound to speak of beyond being a real offer - the cheapest ones are
  // exactly what an "affordable" filter is for. Zero is excluded because `verdictForRent`
  // excludes it too.
  if (band === 'affordable') {
    return { minExclusive: 0, max: affordableMaxRent };
  }
  if (band === 'stretch') {
    return { minExclusive: affordableMaxRent, max: stretchMaxRent };
  }
  return { minExclusive: stretchMaxRent, max: null };
}
