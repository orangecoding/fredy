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
 * Which countries a geocode covers when nothing says otherwise.
 *
 * Fredy shipped as a Germany-only tool: `countrycodes=de` was written into the Nominatim client and
 * the German bounding box into the map. A provider may now declare `countries` on its
 * `metaInformation`, and everything that does not - which today is every provider in the
 * repository - resolves to this. That default is what keeps the change invisible: no provider file
 * has to be touched and no existing installation behaves differently.
 *
 * @type {readonly string[]}
 */
export const DEFAULT_COUNTRIES = Object.freeze(['de']);

/** ISO 3166-1 alpha-2, which is what Nominatim's `countrycodes` parameter takes. */
const ISO_ALPHA_2 = /^[a-z]{2}$/;

/**
 * Read a `countries` declaration into the shape the rest of the code expects.
 *
 * Lenient rather than loud: a provider file that spells the field wrong falls back to Germany
 * instead of taking the process down, because a third-party provider module must not be able to
 * stop Fredy from starting. What keeps that from hiding a typo forever is
 * `test/provider/providerMetaInformation.test.js`, which fails the build when any shipped provider
 * declares something this function would have to discard.
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
