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
