/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Trim a job's location exclusions, dropping blanks and duplicates while preserving the first
 * spelling. Unicode normalization makes a typed umlaut and its decomposed form compare equally.
 *
 * @param {string[]|null|undefined} values
 * @returns {string[]}
 */
export function normalizeExcludedLocations(values) {
  const seen = new Set();
  const locations = [];
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== 'string') continue;
    const location = value.trim().normalize('NFC');
    const key = location.toLowerCase();
    if (!location || seen.has(key)) continue;
    seen.add(key);
    locations.push(location);
  }
  return locations;
}

/**
 * Compile a job's normalized location exclusions once for reuse across its listings. Locations are
 * literal text bounded by the start/end of the address or a character other than a Unicode letter
 * or number, so a district name does not match the beginning of a longer street name.
 *
 * @param {string[]|null|undefined} values
 * @returns {RegExp[]}
 */
export function compileExcludedLocations(values) {
  return normalizeExcludedLocations(values).map((location) => {
    const literal = location.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${literal}(?=$|[^\\p{L}\\p{N}])`, 'u');
  });
}

/**
 * Whether an address contains one of the job's compiled location exclusions, ignoring case. Only
 * address text is considered: a description mentioning a nearby district does not put the listing
 * in it. Unknown addresses remain allowed; this is text matching, not a geographic boundary lookup.
 *
 * @param {string|null|undefined} address
 * @param {RegExp[]} matchers
 * @returns {boolean}
 */
export function matchesExcludedLocation(address, matchers) {
  if (typeof address !== 'string' || !address.trim()) return false;
  const normalizedAddress = address.trim().normalize('NFC').toLowerCase();
  // Several providers use this placeholder when the portal withheld the address.
  if (normalizedAddress === 'no address found') return false;
  return matchers.some((matcher) => matcher.test(normalizedAddress));
}
