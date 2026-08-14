/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Reading a rent-or-buy answer off a portal search URL, so the job form can offer one instead of
 * demanding it.
 *
 * Duplicated from lib/services/dealType.js. The frontend must not import out of lib/ - that code is
 * server-side and free to grow a Node built-in at any time, which would break the Vite build with
 * an error pointing nowhere near the cause.
 *
 * The two copies must agree: the server falls back to its own detection when a job carries no deal
 * type, so a form that guessed differently would show the user one thing and store another.
 * test/ui/dealTypeCopyInSync.test.js fails if they drift apart.
 */

/**
 * Whether a job searches for something to rent or something to buy.
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
 * Guess from a portal search URL whether it looks for rentals or for properties to buy.
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
