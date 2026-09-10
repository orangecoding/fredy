/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** @import { Job } from '../../types/job.js' */
/** @import { PriceRangeParams } from '../../types/providerConfig.js' */

/**
 * Where a job's price range actually lives.
 *
 * Fredy's own spec filter only ever had an upper bound, and most users never touch it: they set the
 * price on the portal and paste the resulting search URL. So the range the user really searched for
 * is in that URL, in whatever spelling the portal happens to use, and Fredy's filter is the
 * fallback rather than the source.
 *
 * Each provider declares its own spelling in `config.priceRangeParams`, next to `sortByDateParam`
 * and for the same reason: portal-specific URL knowledge belongs to the provider module, not to a
 * table in the middle of the app that has to be edited every time a portal is added.
 *
 * A wrong range is worse than no range. The receiving side sorts an observation into a price band,
 * flags one with no band as guessed, and can drop it again later - whereas a confidently wrong
 * number lands in the wrong band and stays there. Everything here therefore answers `null` when it
 * is not sure, and never guesses a bound.
 */

/**
 * A price range as the tracking payload wants it. Either bound may be absent.
 *
 * @typedef {{min: number|null, max: number|null}} PriceRange
 */

/** @type {PriceRange} */
const NO_RANGE = { min: null, max: null };

/**
 * A price bound that was really set, or `null`.
 *
 * The receiving side tells "lower bound only", "upper bound only" and "both" apart and treats them
 * differently, so an unset bound has to travel as null rather than as 0 or a stand-in maximum.
 * 0 and negatives count as unset too - an emptied form field and a portal's "from 0 €" both leave
 * one behind, and neither means the user asked for a lower bound.
 *
 * @param {*} value
 * @returns {number|null}
 */
export function priceBound(value) {
  if (value == null || String(value).trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The first of several query parameters that carries a usable bound.
 *
 * Providers may name more than one: immobilien.de rewrote its search and Fredy still honours the
 * `search.`-prefixed parameters of URLs users saved before the move, so both spellings have to be
 * looked for in the same URL.
 *
 * @param {URLSearchParams} searchParams
 * @param {string|string[]|undefined} names
 * @returns {number|null}
 */
function firstBound(searchParams, names) {
  for (const name of Array.isArray(names) ? names : [names]) {
    if (name == null) continue;
    const bound = priceBound(searchParams.get(name));
    if (bound != null) return bound;
  }
  return null;
}

/**
 * Read the price range out of one provider's search URL.
 *
 * @param {string|null|undefined} url The URL configured on the job for this provider.
 * @param {PriceRangeParams|null|undefined} params What this provider calls its bounds. Absent means
 *   the portal has no price filter in its URL, or nobody has checked yet - both answer no range.
 * @returns {PriceRange}
 */
export function priceRangeFromUrl(url, params) {
  if (url == null || params == null) {
    return NO_RANGE;
  }

  // A portal that does not spell its range as two query parameters brings its own reader. Both of
  // those readers parse a foreign format, so a surprise in it must answer "no range" rather than
  // take the tracking call down with it.
  if (typeof params.parse === 'function') {
    try {
      const range = params.parse(url);
      return { min: priceBound(range?.min), max: priceBound(range?.max) };
    } catch {
      return NO_RANGE;
    }
  }

  let searchParams;
  try {
    searchParams = new URL(url).searchParams;
  } catch {
    return NO_RANGE;
  }

  return { min: firstBound(searchParams, params.min), max: firstBound(searchParams, params.max) };
}

/**
 * The one value every provider that has an opinion agrees on, or `null`.
 *
 * A job can search several portals, each with its own URL and its own price filter. Usually they
 * say the same thing, and a portal whose URL carries no price simply has no opinion. When two of
 * them genuinely disagree there is no honest single band to report, so the bound is dropped and
 * Fredy's own filter gets to answer instead.
 *
 * @param {(number|null)[]} values
 * @returns {number|null}
 */
function agreedOn(values) {
  const distinct = new Set(values.filter((value) => value != null));
  return distinct.size === 1 ? [...distinct][0] : null;
}

/**
 * The price range a job actually searched with.
 *
 * The portal URLs are asked first, per bound rather than as a pair: a user who set only a maximum
 * on the portal and a maximum in Fredy should still have their lower bound answered by Fredy if
 * they set one there. Whatever the URLs leave open falls through to the job's own spec filter, and
 * a job with nothing set anywhere reports no range at all.
 *
 * @param {Job} job
 * @param {Array<{metaInformation?: {id?: string}, config?: {priceRangeParams?: PriceRangeParams}}>} providers
 *   The loaded provider modules, as `getProviders()` hands them over.
 * @returns {PriceRange}
 */
export function resolveJobPriceRange(job, providers = []) {
  const specFilter = job?.specFilter || {};
  const fromSpecFilter = { min: priceBound(specFilter.minPrice), max: priceBound(specFilter.maxPrice) };

  const fromUrls = (Array.isArray(job?.provider) ? job.provider : []).map((entry) => {
    const module = providers.find((provider) => provider?.metaInformation?.id === entry?.id);
    return priceRangeFromUrl(entry?.url, module?.config?.priceRangeParams);
  });

  return {
    min: agreedOn(fromUrls.map(({ min }) => min)) ?? fromSpecFilter.min,
    max: agreedOn(fromUrls.map(({ max }) => max)) ?? fromSpecFilter.max,
  };
}
