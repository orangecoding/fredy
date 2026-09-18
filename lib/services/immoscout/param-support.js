/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Which search parameter the ImmoScout mobile API accepts for which real estate type.
 *
 * The API validates parameters per type. `haspromotion` is fine for `apartmentrent` and answers
 * `412 ERROR_COMMON_URL_PARAMETER_NOT_SUPPORTED` for `housebuy`; an unknown value answers `412
 * ERROR_COMMON_URL_PARAMETER_VALIDATION_FAILED`. Either way the provider gets no listings and logs
 * a failure, which looks exactly like a search that found nothing - so anything a type does not
 * accept is dropped here instead of being forwarded.
 *
 * The table was recorded by replaying every parameter against `search/total` for every type; see
 * `reverse-engineered-immoscout.md`.
 */

import logger from '../logger.js';
import {
  ALL_TYPES,
  APARTMENTS,
  APARTMENT_RENT,
  ASSISTED_LIVING,
  BUY_TYPES,
  COMPULSORY_AUCTION,
  FLATSHARE_ROOM,
  GARAGE_BUY,
  GARAGE_RENT,
  HOUSES,
  HOUSE_BUY,
  LIVING_BUY_SITE,
  LIVING_SPACES,
  RENT_TYPES,
  SHORT_TERM,
  allTypesExcept,
} from './real-estate-types.js';

/**
 * Parameter name to the types that accept it. A parameter absent from this table is one the mobile
 * API does not know at all (`enteredFrom` and friends).
 *
 * @type {Record<string, string[]>}
 */
export const PARAM_SUPPORT = {
  // Accepted by every type.
  exclusioncriteria: ALL_TYPES,
  osmtags: ALL_TYPES,
  fulltext: ALL_TYPES,
  semanticquery: ALL_TYPES,
  tenantNetwork: ALL_TYPES,
  sorting: ALL_TYPES,
  publishedafter: ALL_TYPES,
  // Accepted by everything that has a price of its own.
  price: allTypesExcept(ASSISTED_LIVING, COMPULSORY_AUCTION),
  freeofcourtageonly: allTypesExcept(ASSISTED_LIVING, COMPULSORY_AUCTION),
  // Accepted wherever the listing describes a dwelling.
  energyefficiencyclasses: allTypesExcept(LIVING_BUY_SITE, GARAGE_BUY, GARAGE_RENT, ASSISTED_LIVING),
  minimuminternetspeed: allTypesExcept(LIVING_BUY_SITE, GARAGE_BUY, GARAGE_RENT, ASSISTED_LIVING),
  equipment: [...LIVING_SPACES, FLATSHARE_ROOM, SHORT_TERM, ASSISTED_LIVING],
  petsallowedtypes: [...RENT_TYPES, FLATSHARE_ROOM, SHORT_TERM, ASSISTED_LIVING],
  livingspace: [...LIVING_SPACES, FLATSHARE_ROOM],
  numberofrooms: [...LIVING_SPACES, SHORT_TERM],
  constructionyear: LIVING_SPACES,
  heatingtypes: LIVING_SPACES,
  newbuilding: LIVING_SPACES,
  // Accepted by one family only.
  pricetype: RENT_TYPES,
  apartmenttypes: APARTMENTS,
  floor: APARTMENTS,
  buildingtypes: HOUSES,
  ground: HOUSES,
  luxurypromotion: BUY_TYPES,
  rented: BUY_TYPES,
  haspromotion: [APARTMENT_RENT],
  constructionphasetypes: [HOUSE_BUY],
  newhomebuilder: [HOUSE_BUY],
};

/**
 * Values that only a subset of a parameter's types accept. `pricetype=calculatedtotalrent` is the
 * "Warmmiete" mode and exists for apartments alone - houses answer 412 for it, which is also why
 * ImmoScout serves no warm rent search page for houses. A parameter listed here must have every
 * value it accepts spelled out; anything else is dropped.
 *
 * @type {Record<string, Record<string, string[]>>}
 */
export const PARAM_VALUE_SUPPORT = {
  pricetype: {
    rentpermonth: RENT_TYPES,
    calculatedtotalrent: [APARTMENT_RENT],
  },
};

/**
 * Query parameters the ImmoScout website appends to its own URLs that are not a filter at all:
 * tracking, paging, and the human readable address a radius search shows next to its coordinates.
 * The website drops them from its own API calls too. They are the only parameters allowed to
 * disappear quietly - anything else unrecognised is a filter the user set and we would be throwing
 * their intent away in silence.
 *
 * @type {Set<string>}
 */
const IGNORED_PARAMS = new Set([
  'enteredFrom',
  'centerofsearchaddress',
  'pagenumber',
  'pagesize',
  'searchId',
  'referrer',
]);

/** Tracking parameter families, same idea as {@link IGNORED_PARAMS}. */
const IGNORED_PARAM_PREFIXES = ['utm_', 'cmp_'];

/**
 * Whether a parameter is website noise rather than a filter.
 *
 * @param {string} param Query parameter name.
 * @returns {boolean}
 */
function isNoise(param) {
  return IGNORED_PARAMS.has(param) || IGNORED_PARAM_PREFIXES.some((prefix) => param.startsWith(prefix));
}

/**
 * Whether the mobile API accepts a parameter for a real estate type.
 *
 * A search may name several types (`realestatetype=apartmentbuy,housebuy`), and the API then judges
 * the two halves of a parameter differently - as replayed against `search/total`:
 *
 * - the **name** only has to be accepted by one of the types. `apartmenttypes=penthouse` on
 *   `apartmentbuy,housebuy` answers 200 and narrows the apartments while leaving the houses alone,
 *   the way the website does it.
 * - the **value** has to be accepted by every type that takes the parameter.
 *   `pricetype=calculatedtotalrent` on `apartmentrent,houserent` answers 412, because `houserent`
 *   has no "Warmmiete" - and the whole search returns nothing.
 *
 * @param {string} param Mobile API parameter name.
 * @param {unknown} value Its value, needed for the parameters whose types differ per value.
 * @param {string|string[]} realType The resolved real estate type, or types.
 * @returns {boolean}
 */
export function isSupported(param, value, realType) {
  const realTypes = Array.isArray(realType) ? realType : [realType];
  const supportedTypes = PARAM_SUPPORT[param];
  if (supportedTypes == null) {
    return false;
  }

  const accepting = realTypes.filter((type) => supportedTypes.includes(type));
  if (accepting.length === 0) {
    return false;
  }

  const valueSupport = PARAM_VALUE_SUPPORT[param];
  if (valueSupport == null) {
    return true;
  }

  const typesForValue = valueSupport[String(value)] ?? [];
  return accepting.every((type) => typesForValue.includes(type));
}

/**
 * Keeps the parameters a real estate type accepts and reports the rest.
 *
 * Dropping is the safe half of the trade: the search comes back wider than asked for, where
 * forwarding would return nothing at all. But a dropped filter is still a filter the user set and
 * did not get, so every drop is logged, and the two reasons read differently:
 *
 * - **not supported for this type** - a known filter the mobile API refuses for this real estate
 *   type. Expected, nothing to fix.
 * - **no translator** - a filter ImmoScout has and this table does not know about yet. That is a
 *   gap in Fredy, and the log line is the only place it can surface, so it names the search URL
 *   parameter verbatim and asks for it to be reported.
 *
 * Only the website's own tracking and paging noise passes without a word.
 *
 * @param {Record<string, unknown>} params Candidate parameters.
 * @param {string|string[]} realType The resolved real estate type, or types.
 * @param {string} source Where the parameters came from, for the log line.
 * @returns {Record<string, unknown>} The subset safe to send.
 */
export function keepSupported(params, realType, source) {
  const searchedTypes = (Array.isArray(realType) ? realType : [realType]).join(',');
  const supported = {};
  for (const [param, value] of Object.entries(params)) {
    if (isSupported(param, value, realType)) {
      supported[param] = value;
    } else if (PARAM_SUPPORT[param] != null) {
      logger.warn(`ImmoScout: dropping ${source} "${param}=${value}", not supported for ${searchedTypes}.`);
    } else if (!isNoise(param)) {
      logger.warn(
        `ImmoScout: no translator for ${source} "${param}=${value}" (${searchedTypes}), the filter is ignored. ` +
          `Please report the search URL at https://github.com/orangecoding/fredy/issues so it can be added.`,
      );
    }
  }
  return supported;
}
