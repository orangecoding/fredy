/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The order providers appear in when the user picks one.
 *
 * Two rules, in this order: country first, size within it. The country grouping is what makes a
 * list spanning several markets readable at all - somebody searching in Vienna should not have to
 * read past seventeen German portals - and the size ordering puts the portal most people want at
 * the top instead of wherever the alphabet happened to place it.
 *
 * The alternative, sorting by name, is what the picker did before flags existed. It produced
 * "1a Immobilien" first and ImmoScout24 halfway down.
 */

/**
 * Countries in the order their providers are offered, most-covered market first.
 *
 * A country absent from this list sorts after every country in it, alphabetically by code, so a
 * provider for a new market appears in a sensible place without this file having to be touched.
 *
 * @type {string[]}
 */
export const COUNTRY_ORDER = ['de', 'at', 'ch'];

/**
 * Providers by size within their market, largest first.
 *
 * A judgement call rather than a measurement, and deliberately a single list somebody can reorder
 * in one place when it stops matching reality. Roughly: the national portals, then the large
 * brokerages, then the regional ones, then the single-city boards.
 *
 * A provider missing from this list is not an error - it sorts alphabetically after the ranked ones
 * inside its own country, so adding a provider needs no edit here unless you care where it lands.
 *
 * @type {string[]}
 */
export const PROVIDER_SIZE_ORDER = [
  // Germany
  'immoscout',
  'immowelt',
  'kleinanzeigen',
  'wgGesucht',
  'ohneMakler',
  'immobilienDe',
  'engelVoelkers',
  'mcMakler',
  'sparkasse',
  'neubauKompass',
  'deutscheWohnen',
  'einsAImmobilien',
  'immoswp',
  'imaxx',
  'regionalimmobilien24',
  'inberlinwohnen',
  'schwarzesbrett',
  // Austria
  'willhaben',
  // Switzerland
  'flatfox',
];

/** Sorts anything unranked or unknown behind everything ranked or known. */
const UNRANKED = Number.MAX_SAFE_INTEGER;

/**
 * Which country group a provider belongs to.
 *
 * A provider covering several countries is filed under the first one that appears in
 * {@link COUNTRY_ORDER}, so a German-and-Austrian portal sits with the German ones rather than
 * being repeated or stranded. Its flags still show every country it serves.
 *
 * @param {{countries?: string[]}} provider
 * @returns {string} The alpha-2 code to group by.
 */
export function groupCountryOf(provider) {
  const countries = Array.isArray(provider?.countries) ? provider.countries.map((c) => String(c).toLowerCase()) : [];
  if (countries.length === 0) {
    return '';
  }

  const ranked = countries
    .map((code) => ({ code, rank: COUNTRY_ORDER.indexOf(code) }))
    .sort((a, b) => {
      const left = a.rank === -1 ? UNRANKED : a.rank;
      const right = b.rank === -1 ? UNRANKED : b.rank;
      return left - right || a.code.localeCompare(b.code);
    });

  return ranked[0].code;
}

/**
 * Compare two providers for the picker: country first, then size, then name.
 *
 * @param {{id: string, name: string, countries?: string[]}} a
 * @param {{id: string, name: string, countries?: string[]}} b
 * @returns {number}
 */
export function compareProviders(a, b) {
  const countryA = groupCountryOf(a);
  const countryB = groupCountryOf(b);

  if (countryA !== countryB) {
    const rankA = COUNTRY_ORDER.indexOf(countryA);
    const rankB = COUNTRY_ORDER.indexOf(countryB);
    if (rankA !== rankB) {
      return (rankA === -1 ? UNRANKED : rankA) - (rankB === -1 ? UNRANKED : rankB);
    }
    return countryA.localeCompare(countryB);
  }

  const sizeA = PROVIDER_SIZE_ORDER.indexOf(a?.id);
  const sizeB = PROVIDER_SIZE_ORDER.indexOf(b?.id);
  if (sizeA !== sizeB) {
    return (sizeA === -1 ? UNRANKED : sizeA) - (sizeB === -1 ? UNRANKED : sizeB);
  }

  return String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
}

/**
 * The providers, ordered for display. Does not modify the array it is given.
 *
 * @param {Array<{id: string, name: string, countries?: string[]}>} [providers]
 * @returns {Array<{id: string, name: string, countries?: string[]}>}
 */
export function sortProviders(providers) {
  return [...(providers ?? [])].sort(compareProviders);
}
