/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Subito.it, Italy's largest classifieds site and the place private landlords advertise.
 *
 * A Next.js application that server renders the whole result set into `__NEXT_DATA__`, so the
 * adverts are read out of that payload rather than out of the cards. It is by some distance the
 * richest of the Italian portals: the full description, the publication date and the coordinates
 * are all in the search response, so nothing here needs a detail page.
 *
 * A plain request is enough - the site puts nothing in the way of one - so no browser is launched.
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { readNextData, sanitize } from '../utils/priceExtractors.js';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.subito.it/';

/**
 * A browser's user agent. Subito serves the same document either way, but a request without one is
 * the obvious thing to rate limit first.
 */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** The cut of a photo the search page itself shows. The CDN serves nothing without a rule. */
const IMAGE_RULE = 'rule=large-fixed-card-1x-auto';

/**
 * Read the adverts out of a rendered search page.
 *
 * Two lists are returned for one search. `originalList` is the results; `galleryList` is the strip
 * of promoted adverts above them, and nine of its twelve entries were in no other list on the page
 * Fredy first read. They match the same search, so dropping them means missing adverts an agency
 * paid to put in front of the user - and the ones that repeat are deduplicated here rather than
 * being left to the pipeline, which would count them twice on the way in.
 *
 * @param {string|null|undefined} html the raw html of a search result page
 * @returns {any[]|null} the raw adverts, or null when the page carried no payload
 */
export function parseListings(html) {
  const items = readNextData(html)?.props?.pageProps?.initialState?.items;
  if (items == null) return null;

  const lists = [items.originalList, items.galleryList].filter(Array.isArray);
  if (lists.length === 0) return null;

  const adverts = new Map();
  for (const advert of lists.flat()) {
    if (advert?.urn != null && !adverts.has(advert.urn)) {
      adverts.set(advert.urn, advert);
    }
  }
  return [...adverts.values()];
}

/**
 * @param {string} url the search url, with the sort parameter already appended
 * @returns {Promise<any[]>} the adverts of the first result page
 */
async function getListings(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'it-IT,it;q=0.9' },
  });

  if (!response.ok) {
    logger.error(`Error fetching data from subito: ${response.status} ${response.statusText}`);
    return [];
  }

  const adverts = parseListings(await response.text());
  if (adverts == null) {
    logger.error('Subito returned a page without adverts. The search URL may be wrong.');
    return [];
  }
  return adverts;
}

/**
 * Read one of an advert's attributes.
 *
 * Every attribute arrives as an entry in a map keyed by its own uri, holding a list of values with
 * a machine `key` and a display `value` - `{key: "550", value: "550 €"}`. The key is taken, because
 * it is the only one of the two that is already a plain number.
 *
 * @param {any} advert one entry of the payload
 * @param {string} uri the attribute, e.g. `/price`
 * @returns {string|undefined} the machine value, or undefined when the advert does not carry it
 */
function readFeature(advert, uri) {
  return advert?.features?.[uri]?.values?.[0]?.key;
}

/**
 * The advert's own identity, out of the urn that carries both it and the listing it is shown in.
 *
 * `id:ad:610404179:list:648842038`, and the advert half is a uuid rather than a number on the newer
 * ones. The advert is what stays the same when a landlord relists, so that is the half hashed.
 *
 * @param {string|null|undefined} urn
 * @returns {string} the advert id, or the whole urn when it is not shaped as expected
 */
function readAdvertId(urn) {
  const match = /^id:ad:(.+?):list:/.exec(String(urn ?? ''));
  return match == null ? String(urn ?? '') : match[1];
}

/**
 * Build the address shown on the listing.
 *
 * The map block writes a full postal address - "Via Carezzano, 00166 Roma RM, Italia" - and the
 * country at the end of it says nothing a search inside Italy does not already know. Adverts whose
 * owner hid the exact position carry the town only, which is what the fallback covers.
 *
 * @param {any} geo the advert's `geo` object
 * @returns {string|null} the address, or null when the advert names no place
 */
function buildAddress(geo) {
  const address = geo?.map?.address;
  if (typeof address === 'string' && address.trim().length > 0) {
    return address.replace(/,\s*Italia\s*$/i, '').trim();
  }

  const parts = [geo?.town?.value, geo?.city?.shortName].filter(
    (part) => typeof part === 'string' && part.trim().length > 0,
  );
  return parts.length === 0 ? null : parts.join(', ');
}

/**
 * A coordinate as subito writes it: a string, in machine format.
 *
 * It must not go through the reader the html scrapers use, which treats a dot as a thousands
 * separator and would turn 41.9279404 into a latitude of forty-one million.
 *
 * @param {any} value
 * @returns {number|undefined} the coordinate, or undefined when there is none to read
 */
function readCoordinate(value) {
  const coordinate = Number(value);
  return value == null || value === '' || !Number.isFinite(coordinate) ? undefined : coordinate;
}

/**
 * @param {any} o one advert of the payload
 * @returns {ParsedListing}
 */
function normalize(o) {
  const price = sanitize(readFeature(o, '/price'));
  const map = o?.geo?.map;

  return {
    id: buildHash(readAdvertId(o?.urn), price == null ? null : String(price)),
    title: o?.subject,
    link: o?.urls?.default,
    price,
    size: sanitize(readFeature(o, '/size')),
    rooms: sanitize(readFeature(o, '/room')),
    address: buildAddress(o?.geo),
    latitude: readCoordinate(map?.latitude),
    longitude: readCoordinate(map?.longitude),
    // The search payload carries the whole advert text, so there is no detail page to fetch.
    description: o?.body,
    image: o?.images?.[0]?.cdnBaseUrl == null ? null : `${o.images[0].cdnBaseUrl}?${IMAGE_RULE}`,
  };
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList Terms the job wants filtered out.
 * @returns {boolean}
 */
function applyBlacklist(o, appliedBlackList) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return o.title != null && titleNotBlacklisted && descNotBlacklisted;
}

/** @type {ProviderConfig} */
const config = {
  url: null,
  requiredFieldNames: ['id', 'title', 'link', 'price', 'size', 'rooms', 'address'],
  // The adverts come from __NEXT_DATA__ rather than from the markup, so there is nothing to crawl.
  crawlContainer: null,
  crawlFields: {},
  // Newest first is already subito's default. Sending it explicitly means a pasted URL carrying a
  // different order still gets the one the pipeline expects. The parameter is `order`; `sort`, the
  // name the search state uses for it internally, is accepted and ignored.
  sortByDateParam: 'order=datedesc',
  // ?ps=500&pe=1000 - "prezzo start" and "prezzo end", as the site abbreviates them.
  priceRangeParams: { min: 'ps', max: 'pe' },
  getListings,
  normalize,
  activityProbe: checkIfListingIsActive,
};

export const metaInformation = {
  countries: ['it'],
  name: 'Subito',
  baseUrl: BASE_URL,
  id: 'subito',
};

/**
 * Build a run-scoped provider configuration.
 *
 * @param {{url: string, enabled?: boolean}} sourceConfig The job's entry for this provider.
 * @param {string[]} [blacklist] Terms to filter listings out by.
 * @returns {ProviderConfig} A configuration usable by a single pipeline run.
 */
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});

export { config };
