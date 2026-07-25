/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Whether a job searches for something to rent or something to buy.
 *
 * @type {Readonly<{RENT: 'rent', BUY: 'buy'}>}
 */
export const DEAL_TYPES = Object.freeze({ RENT: 'rent', BUY: 'buy' });

/**
 * Word starts that mark a rental search on the German portals Fredy supports:
 * `wohnung-mieten`, `search.typ=mieten`, `mietobjekte`, `t=apartment:rental`, `rentType=miete`.
 *
 * Matching is anchored at the start of a word, so `miet` covers the whole family (mieten, miete,
 * mietwohnung, mietangebote) while `rent` cannot be found inside `current` or `parent`.
 */
const RENT_PATTERN = /(^|[^a-z])(miet|rent)/;

/**
 * The same for a purchase search: `wohnung-kaufen`, `marketingType=buy`, `distributionTypes=Buy`,
 * `eigentumswohnung`.
 *
 * `kauf` deliberately does not match inside `verkauf` - a portal that only says "Verkauf" is left
 * undecided rather than being classified off a substring that also appears in rental sections
 * (schwarzesbrett serves both under `/verkauf-und-angebote/`).
 */
const BUY_PATTERN = /(^|[^a-z])(kauf|buy|eigentum|purchase)/;

/**
 * Coerce a user- or API-supplied value into a deal type.
 *
 * @param {*} value
 * @returns {'rent'|'buy'|null} `null` for anything that is not one of the two known types.
 */
export function normalizeDealType(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const lower = value.trim().toLowerCase();
  return lower === DEAL_TYPES.RENT || lower === DEAL_TYPES.BUY ? lower : null;
}

/**
 * Guess from a portal search URL whether it looks for rentals or for properties to buy.
 *
 * This is deliberately a token match rather than per-portal knowledge: it only has to classify
 * the jobs that already exist when the deal type is introduced. Every job created afterwards
 * carries the type the user picked in the form, so a wrong guess here is a one-off the user can
 * correct rather than something that keeps being wrong.
 *
 * Both families of tokens appearing (e.g. a portal path "verkauf-und-angebote/mietobjekte") is
 * treated as undecided, because there is no honest way to rank them.
 *
 * @param {string|null|undefined} url
 * @returns {'rent'|'buy'|null} `null` when the URL does not say, or says both.
 */
export function detectDealTypeFromUrl(url) {
  if (typeof url !== 'string' || url.trim().length === 0) {
    return null;
  }
  let haystack = url.toLowerCase();
  try {
    haystack = decodeURIComponent(haystack);
  } catch {
    // A malformed escape sequence is no reason to give up - match on the raw URL instead.
  }
  const hasRent = RENT_PATTERN.test(haystack);
  const hasBuy = BUY_PATTERN.test(haystack);
  if (hasRent === hasBuy) {
    return null;
  }
  return hasRent ? DEAL_TYPES.RENT : DEAL_TYPES.BUY;
}

/**
 * Classify a job by looking at the search URLs of its providers.
 *
 * The first URL that says something decides. A job mixing a rental and a purchase search is
 * rare, and the alternative - a third "mixed" state every consumer would have to handle - buys
 * nothing the user cannot fix by picking the right type in the job form.
 *
 * @param {Array<{url?: string}>|null|undefined} providerEntries
 * @returns {'rent'|'buy'|null} `null` when none of the URLs say.
 */
export function detectDealTypeForJob(providerEntries) {
  if (!Array.isArray(providerEntries)) {
    return null;
  }
  for (const entry of providerEntries) {
    const detected = detectDealTypeFromUrl(entry?.url);
    if (detected != null) {
      return detected;
    }
  }
  return null;
}

/**
 * The pre-deal-type heuristic, kept as a last resort: a price beyond what any flat costs per
 * month is a purchase price, anything below it is a monthly rent.
 *
 * @param {*} price
 * @param {number} threshold Price at or above which a listing counts as a purchase.
 * @returns {'rent'|'buy'|null} `null` when there is no usable price to judge.
 */
export function dealTypeForPrice(price, threshold) {
  const parsed = Number(price);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed >= Number(threshold) ? DEAL_TYPES.BUY : DEAL_TYPES.RENT;
}
