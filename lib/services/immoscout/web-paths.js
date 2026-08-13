/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * What the last segment of an ImmoScout web search path means.
 *
 * When a search carries exactly one filter, the web UI writes it into the path instead of the query
 * string: buying a house with a garage is `haus-mit-garage-kaufen`, not
 * `haus-kaufen?equipment=parking`, and the path is the only place that filter appears. Restoring it
 * is therefore not cosmetic, and a path missing from these tables has no real estate type at all.
 *
 * Every entry was read off ImmoScout itself: each search page reports the search it resolved to in
 * a `lastSearchApiUrl` field, and a path the site does not serve answers 410 - which is how the
 * one-sided slugs below were told apart from the symmetric ones. See
 * `reverse-engineered-immoscout.md`.
 */

import {
  APARTMENT_BUY,
  APARTMENT_RENT,
  ASSISTED_LIVING,
  COMPULSORY_AUCTION,
  FLATSHARE_ROOM,
  GARAGE_BUY,
  GARAGE_RENT,
  HOUSE_BUY,
  HOUSE_RENT,
  INVESTMENT,
  LIVING_BUY_SITE,
  SHORT_TERM,
} from './real-estate-types.js';

/**
 * @typedef {object} WebPath
 * @property {string} realType The mobile API `realestatetype`.
 * @property {Record<string, unknown>} params Filters the path itself stands for.
 * @property {Record<string, string[]>} [defaults] Type defaults this path replaces, if any.
 */

/**
 * Defaults the web app applies when the URL says nothing. Rent apartment searches hide exchange
 * flats; nothing else carries a default. Anything the URL states replaces these, exactly as on the
 * website: `wohnung-mieten?exclusioncriteria=projectlisting` searches with `projectlisting` alone
 * and lets exchange flats back in.
 *
 * @type {Record<string, Record<string, string[]>>}
 */
export const DEFAULT_PARAMS_BY_TYPE = {
  [APARTMENT_RENT]: { exclusioncriteria: ['swapflat'] },
};

/**
 * Base web paths: the plain "what am I looking for" slugs that carry no filter.
 * @type {Record<string, string>}
 */
const BASE_PATHS = {
  'wohnung-mieten': APARTMENT_RENT,
  'wohnung-kaufen': APARTMENT_BUY,
  'haus-mieten': HOUSE_RENT,
  'haus-kaufen': HOUSE_BUY,
  anlageimmobilie: INVESTMENT,
  'grundstueck-kaufen': LIVING_BUY_SITE,
  'garage-kaufen': GARAGE_BUY,
  'garage-mieten': GARAGE_RENT,
  'wg-zimmer': FLATSHARE_ROOM,
  'wohnen-auf-zeit': SHORT_TERM,
  seniorenwohnen: ASSISTED_LIVING,
  zwangsversteigerung: COMPULSORY_AUCTION,
};

/**
 * Apartment slugs. Registered for both `-mieten` and `-kaufen`, both of which ImmoScout serves.
 * @type {Record<string, Record<string, unknown>>}
 */
const APARTMENT_SLUGS = {
  // Category "Wohnungstyp"
  souterrainwohnung: { apartmenttypes: ['halfbasement'] },
  erdgeschosswohnung: { apartmenttypes: ['groundfloor'] },
  hochparterrewohnung: { apartmenttypes: ['raisedgroundfloor'] },
  etagenwohnung: { apartmenttypes: ['apartment'] },
  loft: { apartmenttypes: ['loft'] },
  maisonette: { apartmenttypes: ['maisonette'] },
  terrassenwohnung: { apartmenttypes: ['terracedflat'] },
  penthouse: { apartmenttypes: ['penthouse'] },
  dachgeschosswohnung: { apartmenttypes: ['roofstorey'] },
  // Category "Ausstattung"
  'wohnung-mit-garage': { equipment: ['parking'] },
  'wohnung-mit-einbaukueche': { equipment: ['builtinkitchen'] },
  'wohnung-mit-keller': { equipment: ['cellar'] },
  'wohnung-mit-balkon': { equipment: ['balcony'] },
  'wohnung-mit-garten': { equipment: ['garden'] },
  // Category "Merkmale"
  neubauwohnung: { newbuilding: true },
  'barrierefreie-wohnung': { equipment: ['handicappedaccessible'] },
  // These two are a full text search on the website as well. It also sends `semanticquery` with the
  // same word, but that one barely narrows anything down (1000 of 1072 listings for "altbau", where
  // the full text search leaves 67) and adding it to the full text search changes nothing.
  altbauwohnung: { fulltext: 'altbau' },
  'wohnung-von-privat': { fulltext: 'privat' },
};

/**
 * House slugs. Registered for both `-mieten` and `-kaufen`, both of which ImmoScout serves.
 * @type {Record<string, Record<string, unknown>>}
 */
const HOUSE_SLUGS = {
  // Category "Haustyp"
  einfamilienhaus: { buildingtypes: ['singlefamilyhouse'] },
  doppelhaushaelfte: { buildingtypes: ['semidetachedhouse'] },
  reihenhaus: { buildingtypes: ['terracehouse'] },
  bungalow: { buildingtypes: ['bungalow'] },
  mehrfamilienhaus: { buildingtypes: ['multifamilyhouse'] },
  bauernhaus: { buildingtypes: ['farmhouse'] },
  villa: { buildingtypes: ['villa'] },
  // Category "Ausstattung"
  'haus-mit-garage': { equipment: ['parking'] },
  'haus-mit-keller': { equipment: ['cellar'] },
  // Category "Merkmale"
  neubauhaus: { newbuilding: true },
};

/**
 * Whole slugs, for the paths that do not follow the `<base>-mieten` / `<base>-kaufen` shape: either
 * ImmoScout publishes only one side of the market (the counterpart answers 410, so registering it
 * would invent a search the website does not offer) or the filter sits before the suffix.
 *
 * @type {Array<[slug: string, realType: string, params: Record<string, unknown>, defaults?: Record<string, string[]>]>}
 */
const WHOLE_SLUGS = [
  ['luxushaus-kaufen', HOUSE_BUY, { luxurypromotion: true }],
  ['luxuswohnung-kaufen', APARTMENT_BUY, { luxurypromotion: true }],
  ['guenstiges-haus-kaufen', HOUSE_BUY, { price: '-100000.0' }],
  ['guenstige-wohnung-kaufen', APARTMENT_BUY, { price: '-100000.0' }],
  ['guenstige-wohnung-mieten', APARTMENT_RENT, { price: '-400.0', pricetype: 'rentpermonth' }],
  ['studentenwohnung-mieten', APARTMENT_RENT, { price: '-350.0', pricetype: 'rentpermonth' }],
  ['moeblierte-wohnung-mieten', APARTMENT_RENT, { fulltext: 'möbliert' }],
  ['provisionsfreies-haus-kaufen', HOUSE_BUY, { freeofcourtageonly: true }],
  ['provisionsfreie-wohnung-kaufen', APARTMENT_BUY, { freeofcourtageonly: true }],
  ['haus-bauen', HOUSE_BUY, { newhomebuilder: true }],
  ['besondere-immobilien', HOUSE_BUY, { buildingtypes: ['specialrealestate'] }],
  // The two whose filter sits before the suffix instead of after it.
  ['wohnung-kaufen-mit-balkon', APARTMENT_BUY, { equipment: ['balcony'] }],
  ['eigentumswohnung-mit-garten', APARTMENT_BUY, { equipment: ['garden'] }],
  // Two rent slugs that differ from the apartmentrent default rather than adding a filter.
  ['bestandswohnung-mieten', APARTMENT_RENT, {}, { exclusioncriteria: ['swapflat', 'projectlisting'] }],
  ['mietwohnungen-mit-tauschwohnungen', APARTMENT_RENT, {}, { exclusioncriteria: [] }],
];

/**
 * Every literal web path we translate.
 * @type {Record<string, WebPath>}
 */
const WEB_PATHS = {};

for (const [slug, realType] of Object.entries(BASE_PATHS)) {
  WEB_PATHS[slug] = { realType, params: {} };
}
for (const [slug, params] of Object.entries(APARTMENT_SLUGS)) {
  WEB_PATHS[`${slug}-mieten`] = { realType: APARTMENT_RENT, params };
  WEB_PATHS[`${slug}-kaufen`] = { realType: APARTMENT_BUY, params };
}
for (const [slug, params] of Object.entries(HOUSE_SLUGS)) {
  WEB_PATHS[`${slug}-mieten`] = { realType: HOUSE_RENT, params };
  WEB_PATHS[`${slug}-kaufen`] = { realType: HOUSE_BUY, params };
}
for (const [slug, realType, params, defaults] of WHOLE_SLUGS) {
  WEB_PATHS[slug] = { realType, params, defaults };
}

/**
 * Paths the web UI generates from a number rather than from a fixed vocabulary. Each rule turns the
 * captured groups into the same shape a literal path resolves to.
 *
 * @type {Array<{ pattern: RegExp, resolve: (groups: Record<string, string>) => WebPath, example: string }>}
 */
const WEB_PATH_PATTERNS = [
  {
    // "3-zimmer-wohnung-mieten" - a room count. ImmoScout publishes one to six rooms and nothing
    // beyond (`7-zimmer-wohnung-mieten` answers 410); six is the open ended one.
    pattern: /^(?<rooms>[1-6])-zimmer-wohnung-(?<deal>mieten|kaufen)$/,
    resolve: ({ rooms, deal }) => ({
      realType: deal === 'mieten' ? APARTMENT_RENT : APARTMENT_BUY,
      params: { numberofrooms: rooms === '6' ? '6.0-' : `${rooms}.0-${rooms}.5` },
    }),
    example: '3-zimmer-wohnung-mieten',
  },
  {
    // "wohnung-bis-800-euro-warm" - a maximum warm rent. Apartments only: ImmoScout serves no such
    // page for houses (410) and the mobile API rejects calculatedtotalrent for houserent.
    pattern: /^wohnung-bis-(?<price>\d+)-euro-warm$/,
    resolve: ({ price }) => ({
      realType: APARTMENT_RENT,
      params: { price: `-${price}`, pricetype: 'calculatedtotalrent' },
    }),
    example: 'wohnung-bis-800-euro-warm',
  },
];

/**
 * Resolves the last segment of a web search path to the search it stands for.
 *
 * @param {string} slug Last path segment, e.g. `haus-mit-garage-kaufen`.
 * @returns {WebPath | null} `null` when ImmoScout serves a path we have not registered.
 */
export function resolveWebPath(slug) {
  if (WEB_PATHS[slug]) {
    return WEB_PATHS[slug];
  }

  for (const { pattern, resolve } of WEB_PATH_PATTERNS) {
    const match = slug.match(pattern);
    if (match) {
      return resolve(match.groups);
    }
  }

  return null;
}

/**
 * Every web search path the translator knows, literal ones plus one example per generated pattern.
 * Exposed so a test can replay the whole catalogue against the live mobile API - the only way to
 * notice that ImmoScout retired a path or stopped accepting a parameter for a type.
 *
 * @returns {string[]} Last path segments, e.g. `haus-mit-garage-kaufen`.
 */
export function listKnownWebPaths() {
  return [...Object.keys(WEB_PATHS), ...WEB_PATH_PATTERNS.map(({ example }) => example)];
}
