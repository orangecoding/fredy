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
 * Whether an address contains one of the job's excluded locations, ignoring case. Only address text is
 * considered: a description mentioning a nearby district does not put the listing in it. Unknown
 * addresses remain allowed; this is text matching, not a geographic boundary lookup.
 *
 * @param {string|null|undefined} address
 * @param {string[]|null|undefined} excludedLocations
 * @returns {boolean}
 */
export function matchesExcludedLocation(address, excludedLocations) {
  if (typeof address !== 'string' || !address.trim()) return false;
  const normalizedAddress = address.trim().normalize('NFC').toLowerCase();
  // Several providers use this placeholder when the portal withheld the address.
  if (normalizedAddress === 'no address found') return false;
  return normalizeExcludedLocations(excludedLocations).some((location) =>
    normalizedAddress.includes(location.toLowerCase()),
  );
}
