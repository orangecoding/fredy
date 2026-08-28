/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Flatfox, a Swiss rental portal, reached through the same JSON API its own website uses.
 *
 * The three larger Swiss portals - Homegate, ImmoScout24.ch and Comparis - all sit behind bot
 * protection that refuses a datacenter and, in testing, a residential connection too. Flatfox does
 * not, and answers JSON, which makes it both the easiest and the sturdiest Swiss source available.
 *
 * The website fetches a search in two steps, and so does this:
 *
 * 1. `GET /api/v1/pin/?{search parameters}` returns one pin per match - primary key and
 *    coordinates - for the whole result set at once.
 * 2. `GET /api/v1/public-listing/?pk=…&pk=…` hydrates those keys into full listings.
 *
 * The search parameters are taken verbatim from the URL the user pasted, so anything the site's own
 * filters can express works here without Fredy having to know what it means.
 */

import { buildHash, isOneOf } from '../utils.js';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://flatfox.ch/';
const PIN_ENDPOINT = 'https://flatfox.ch/api/v1/pin/';
const LISTING_ENDPOINT = 'https://flatfox.ch/api/v1/public-listing/';

/**
 * How many pins to ask for. The website itself asks for a hundred, and a job only ever cares about
 * the newest handful, so there is nothing to gain by paging further.
 */
const MAX_PINS = 100;

const REQUEST_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'de-CH,de;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

/**
 * @param {string} url
 * @param {string} what - Named in the log line when the request fails.
 * @returns {Promise<any|null>}
 */
async function getJson(url, what) {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok) {
    logger.error(`Error fetching ${what} from Flatfox: ${response.status} ${response.statusText}`);
    return null;
  }
  return response.json();
}

/**
 * The search parameters of a pasted Flatfox URL, as the API wants them.
 *
 * Everything the user's search carries is forwarded untouched - the map bounds, the category, the
 * price ceiling - because both the website and the API read the same names.
 *
 * @param {string} url
 * @returns {URLSearchParams}
 */
function searchParamsOf(url) {
  try {
    const params = new URLSearchParams(new URL(url).search);
    params.set('max_count', String(MAX_PINS));
    return params;
  } catch {
    logger.error(`Could not read the Flatfox search URL: ${url}`);
    return new URLSearchParams({ max_count: String(MAX_PINS) });
  }
}

/**
 * @param {string} url The job's search URL.
 * @returns {Promise<Object[]>}
 */
async function getListings(url) {
  const pins = await getJson(`${PIN_ENDPOINT}?${searchParamsOf(url)}`, 'the result pins');
  if (pins == null) {
    return [];
  }

  const keys = (Array.isArray(pins) ? pins : (pins.results ?? []))
    .map((pin) => pin?.pk)
    .filter((pk) => pk != null)
    .slice(0, MAX_PINS);

  if (keys.length === 0) {
    return [];
  }

  // `limit=0` lifts the page size rather than asking for nothing: without it the response is capped
  // well below the hundred keys being requested.
  const query = new URLSearchParams({ expand: 'cover_image', limit: '0' });
  for (const key of keys) {
    query.append('pk', String(key));
  }

  const hydrated = await getJson(`${LISTING_ENDPOINT}?${query}`, 'the listings');
  if (hydrated == null) {
    return [];
  }

  const listings = Array.isArray(hydrated) ? hydrated : (hydrated.results ?? []);

  // The pin endpoint answers in its own order and takes no sort parameter, so the ordering the
  // pipeline needs is applied here instead of being asked for.
  return listings.sort((a, b) => String(b.published ?? '').localeCompare(String(a.published ?? '')));
}

/**
 * Read one of the API's numbers.
 *
 * Deliberately not `extractNumber`: that parser is built for the German-formatted text the scraping
 * providers pull off a page, where a dot groups thousands. Flatfox answers JSON with English
 * decimals, so it read `number_of_rooms: "2.0"` as a twenty-room flat.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The full street address, which Flatfox publishes on every listing.
 *
 * @param {Object} o
 * @returns {string|null}
 */
function buildAddress(o) {
  const town = [o.zipcode, o.city].filter((part) => part != null && String(part).trim().length > 0).join(' ');
  const address = [o.street, town].filter((part) => part != null && String(part).trim().length > 0).join(', ');
  return address.length > 0 ? address : null;
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  return {
    id: buildHash(String(o.pk), o.price_display),
    // `public_title` reads "Leimgrübelstrasse 22A, 8052 Zürich - CHF 1'440", which is the address
    // and the price again. The listing's own title is the one that says something about the flat.
    title: o.title || o.public_title,
    // Listing URLs are language-scoped and the API answers with the English one.
    link: o.url
      ? `${BASE_URL}${String(o.url)
          .replace(/^\/en\//, 'de/')
          .replace(/^\//, '')}`
      : null,
    // Nettomiete first: `price_display` and `rent_gross` are the Bruttomiete, Nebenkosten already
    // included, and the affordability check adds a Nebenkosten surcharge to whatever stands here.
    // Roughly half of Flatfox's listings publish no Nettomiete at all, so the gross figure stays as
    // the fallback - a rent that is 25 % too pessimistic still beats a listing dropped for want of
    // a price.
    price: toNumber(o.rent_net ?? o.price_display ?? o.rent_gross),
    size: toNumber(o.surface_living),
    rooms: toNumber(o.number_of_rooms),
    address: buildAddress(o),
    description: o.description,
    image: o.cover_image?.url ?? null,
  };
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList
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
  crawlContainer: null,
  crawlFields: {},
  // The API takes no sort parameter; getListings orders the results itself.
  sortByDateParam: null,
  getListings,
  normalize,
};

export const metaInformation = {
  countries: ['ch'],
  name: 'Flatfox',
  baseUrl: BASE_URL,
  id: 'flatfox',
};

/**
 * Build a run-scoped provider configuration.
 *
 * @param {{url: string, enabled?: boolean}} sourceConfig
 * @param {string[]} [blacklist]
 * @returns {ProviderConfig}
 */
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});

export { config };
