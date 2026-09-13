/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Country codes, with nothing behind them.
 *
 * Deliberately free of imports. The resolvers in `providerCountries.js` reach for the provider
 * modules and the job storage, which drags in the database; the Nominatim client needs the default
 * and nothing else, and must not boot SQLite to learn what it is.
 */

/**
 * The fallback for a geocode with nothing to resolve against.
 *
 * Every provider declares its own `countries`, so this is never the answer to "what did this
 * provider say" - it is the answer to "there was nobody to ask": a listing whose provider module has
 * since been deleted, a user with no jobs yet, a store slice that has not loaded. Germany because
 * that is what Fredy searched from its first commit until countries existed, and because sixteen of
 * the shipped providers are German.
 *
 * @type {readonly string[]}
 */
export const DEFAULT_COUNTRIES = Object.freeze(['de']);

/** ISO 3166-1 alpha-2, which is what Nominatim's `countrycodes` parameter takes. */
const ISO_ALPHA_2 = /^[a-z]{2}$/;

/**
 * Read a `countries` declaration into the shape the rest of the code expects.
 *
 * The field is required on every provider, but this is lenient rather than loud: a provider file
 * that spells it wrong falls back to Germany instead of taking the process down, because a
 * third-party provider module must not be able to stop Fredy from starting. What keeps that from
 * hiding a typo forever is `test/provider/providerMetaInformation.test.js`, which fails the build
 * when any shipped provider omits the field or declares something this function would discard.
 *
 * @param {unknown} raw - Whatever the provider put on `metaInformation.countries`.
 * @returns {string[]} Sorted, deduplicated alpha-2 codes. Never empty.
 */
export function normalizeCountries(raw) {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_COUNTRIES];
  }

  const codes = new Set();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const code = entry.trim().toLowerCase();
    if (ISO_ALPHA_2.test(code)) {
      codes.add(code);
    }
  }

  return codes.size === 0 ? [...DEFAULT_COUNTRIES] : [...codes].sort();
}

/**
 * The countries one *listing* could be in, which is not always the countries its provider serves.
 *
 * A provider that covers several markets answers for all of them at once, and that is the right
 * answer to "where does this provider search" and the wrong one to "where is this flat". idealista
 * is the case: one provider over Spain, Italy and Portugal, so a Milanese street was geocoded
 * against `es,it,pt` and could come back as its Spanish namesake, and an advert in Madrid was sent
 * to whichever of the three has a coverage register - which reads the address in the wrong
 * language, spends a throttled request on it and stamps the listing "nothing here" until the
 * answer goes stale.
 *
 * So a provider may narrow the answer per listing by declaring `countryOf` next to `countries`.
 * idealista reads it off the hostname of the advert's own link, which is the one thing a stored row
 * carries that says which of the three sites it came from. Everything a provider cannot answer for
 * - a listing whose link is gone, a provider that declares no `countryOf` at all - keeps the
 * declaration, so nothing has to be answered that cannot be.
 *
 * Two things the narrowing may not do. It may not widen: a code the provider never declared is
 * discarded rather than searched, because the declaration is what the job form, the map bounds and
 * every "which providers cover this country" answer are built from, and one narrowing call site
 * must not be able to disagree with all of them. And it may not fail: `countryOf` is a function in
 * a provider module, run inside a sweep over the whole database, so a throwing one falls back to
 * the declaration instead of ending the sweep.
 *
 * @param {{countries?: unknown, countryOf?: (listing: any) => (string|null|undefined)}|null|undefined} meta
 *   The provider's `metaInformation`.
 * @param {any} listing The listing being placed. Anything the provider's `countryOf` can read; the
 *   shipped one wants `link`.
 * @returns {string[]} One code where the provider narrowed it, the whole declaration otherwise.
 */
export function countriesForListing(meta, listing) {
  const declared = normalizeCountries(meta?.countries);
  if (listing == null || typeof meta?.countryOf !== 'function') {
    return declared;
  }

  let answer;
  try {
    answer = meta.countryOf(listing);
  } catch {
    // Nothing is logged here on purpose: this module imports nothing, which is what lets the
    // Nominatim client read it without booting SQLite behind it. A provider whose `countryOf`
    // throws every time is a provider that never narrows, which is exactly the behaviour it had
    // before it declared one.
    return declared;
  }

  if (typeof answer !== 'string') {
    return declared;
  }
  const code = answer.trim().toLowerCase();
  return ISO_ALPHA_2.test(code) && declared.includes(code) ? [code] : declared;
}

/**
 * Fold several country lists into one.
 *
 * Sorted so the `countrycodes` parameter of two equivalent unions is byte-identical, which is what
 * lets Nominatim's own caching see them as the same request.
 *
 * @param {string[][]} lists
 * @returns {string[]} The union, or the default when there is nothing to union.
 */
export function unionCountries(lists) {
  const codes = new Set();
  for (const list of lists) {
    for (const code of list) {
      codes.add(code);
    }
  }
  return codes.size === 0 ? [...DEFAULT_COUNTRIES] : [...codes].sort();
}
