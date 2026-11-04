/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as cheerio from 'cheerio';
import { buildHash, isOneOf } from '../utils.js';
import { wallClockInZone } from '../utils/publicationDate.js';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://gratka.pl/';
const MAX_PAGES = 5;
const SEARCH_PATH = /^\/nieruchomosci\/(?:domy|mieszkania)(?:\/|$)/;
// `ob` is a standalone advert, `oi` one unit of a development; both carry their own price.
const ADVERT_PATH = /^\/nieruchomosci\/[\w-]+\/o[bi]\/\d+$/;

/**
 * Rebuild the value Nuxt serialised with devalue into `__NUXT_DATA__`.
 *
 * The payload is one flat array: index 0 is the root, objects and arrays hold indices into the
 * array rather than values, and an array whose first entry is a string is a tagged value (`Date`,
 * `Set`, `Map`, or one of Nuxt's reactive wrappers, which carry their content as the next index).
 * Only plain data comes out; nothing is evaluated.
 *
 * @param {unknown[]} values
 * @returns {unknown}
 */
export function unflatten(values) {
  const hydrated = new Map();
  const hydrate = (index) => {
    // Negative indices are devalue's constants: undefined, a hole, NaN, the infinities and -0.
    if (!Number.isInteger(index) || index < 0 || index >= values.length) return undefined;
    if (hydrated.has(index)) return hydrated.get(index);
    const value = values[index];
    if (value == null || typeof value !== 'object') {
      hydrated.set(index, value);
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === 'string') {
      const [tag, ...rest] = value;
      if (tag === 'Date') {
        hydrated.set(index, rest[0]);
      } else if (tag === 'Set' || tag === 'Map') {
        const items = [];
        hydrated.set(index, items);
        for (const item of rest) items.push(hydrate(item));
      } else if (tag === 'null') {
        const object = {};
        hydrated.set(index, object);
        for (let i = 0; i < rest.length; i += 2) object[rest[i]] = hydrate(rest[i + 1]);
      } else {
        hydrated.set(index, undefined);
        hydrated.set(index, hydrate(rest[0]));
      }
      return hydrated.get(index);
    }
    if (Array.isArray(value)) {
      const items = [];
      hydrated.set(index, items);
      for (const item of value) items.push(hydrate(item));
      return items;
    }
    const object = {};
    hydrated.set(index, object);
    for (const [key, item] of Object.entries(value)) object[key] = hydrate(item);
    return object;
  };
  return hydrate(0);
}

/**
 * Read the server-rendered search, distinguishing an empty search from a changed schema.
 * @param {string} html
 * @returns {{items: Object[], pagination: {currentPage: number, totalPages: number}}}
 */
export function parseSearchPage(html) {
  let data = null;
  try {
    const raw = cheerio
      .load(html ?? '')('script#__NUXT_DATA__')
      .first()
      .text();
    data = raw ? /** @type {any} */ (unflatten(JSON.parse(raw)))?.data : null;
  } catch {
    data = null;
  }
  const entry = (prefix) => Object.entries(data ?? {}).find(([key]) => key.startsWith(prefix))?.[1]?.data;
  const properties = entry('property-listing-data-')?.searchResult?.properties;
  const parameters = entry('decode-listing-url-query-')?.decodeListingUrl?.listingParameters;
  if (
    !Array.isArray(properties?.nodes) ||
    !Number.isInteger(properties.totalCount) ||
    properties.totalCount < 0 ||
    !Number.isInteger(parameters?.pageNumber) ||
    parameters.pageNumber < 1 ||
    !Number.isInteger(parameters.numberOfResults) ||
    parameters.numberOfResults < 1
  ) {
    throw new Error('Gratka returned no valid search payload. The page may be blocked or its format changed.');
  }
  return {
    items: properties.nodes,
    pagination: {
      currentPage: parameters.pageNumber,
      totalPages: Math.ceil(properties.totalCount / parameters.numberOfResults),
    },
  };
}

/**
 * Fetch a bounded set of newest adverts, keeping the user's filters intact.
 * @param {string} url
 * @returns {Promise<Object[]>}
 */
async function getListings(url) {
  const searchUrl = new URL(url);
  if (
    searchUrl.protocol !== 'https:' ||
    searchUrl.hostname !== 'gratka.pl' ||
    searchUrl.port !== '' ||
    searchUrl.username !== '' ||
    searchUrl.password !== '' ||
    !SEARCH_PATH.test(searchUrl.pathname)
  ) {
    throw new Error(
      'Gratka supports Polish flat and house searches: https://gratka.pl/nieruchomosci/domy|mieszkania/...',
    );
  }
  // Gratka redirects a path with a trailing slash to the one without, and redirects are refused below.
  searchUrl.pathname = searchUrl.pathname.replace(/\/+$/, '');
  searchUrl.searchParams.set('sort', 'newest');
  const adverts = new Map();
  for (let page = 1; page <= MAX_PAGES; page++) {
    // Gratka answers an explicit first page with 404.
    if (page === 1) searchUrl.searchParams.delete('page');
    else searchUrl.searchParams.set('page', String(page));
    const response = await fetch(searchUrl.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'pl-PL,pl;q=0.9' },
      signal: AbortSignal.timeout(30_000),
      // Never follow a portal redirect to an unrelated host or a private address.
      redirect: 'error',
    });
    // A page past the end answers 404. Adverts expiring while a run pages through can move the end
    // forward, so a later page that is gone ends the search instead of discarding what was read.
    if (response.status === 404 && page > 1) break;
    if (!response.ok) throw new Error(`Gratka search failed: ${response.status} ${response.statusText}`);
    const { items, pagination } = parseSearchPage(await response.text());
    if (pagination.currentPage !== page)
      throw new Error(`Gratka returned page ${pagination.currentPage} instead of ${page}.`);
    const before = adverts.size;
    for (const item of items) {
      if (item?.id != null && !adverts.has(item.id)) adverts.set(item.id, item);
    }
    if (items.length === 0 || adverts.size === before || page >= pagination.totalPages) break;
    if (page === MAX_PAGES) logger.warn(`Gratka search stopped at the ${MAX_PAGES}-page limit.`);
  }
  return [...adverts.values()].filter((item) => {
    // Development cards describe several properties and may carry no single asking price.
    if (item.development != null && item.price == null) return false;
    // Every listing is stored as PLN; a seller pricing in EUR or USD is skipped rather than failing the run.
    return item.price?.currency == null || item.price.currency === 'PLN';
  });
}

/** @param {unknown} value @returns {number|null} */
function numberOf(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * "4 pokoje" is 4. Gratka's top bucket, "więcej niż 9 pokoi", is read as its lower bound 10, so a
 * minimum-rooms filter still applies to it.
 * @param {unknown} label
 * @returns {number|null}
 */
function roomsOf(label) {
  if (typeof label !== 'string') return null;
  if (/^więcej niż (\d+)/i.test(label)) return Number(/^więcej niż (\d+)/i.exec(label)[1]) + 1;
  return numberOf(/^(\d+)/.exec(label)?.[1]);
}

/**
 * The day Gratka says an advert was added. It gives a bare date, read as midnight in Poland.
 * @param {unknown} value
 * @returns {number|undefined}
 */
function addedAt(value) {
  const date = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!date) return undefined;
  const [year, month, day] = date.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return undefined;
  return wallClockInZone({ year, month, day }, 'Europe/Warsaw');
}

/**
 * A photo id is the original picture's url, base64 encoded.
 * @param {unknown} id
 * @returns {string|null}
 */
function photoUrl(id) {
  if (typeof id !== 'string') return null;
  try {
    const url = new URL(Buffer.from(id, 'base64').toString('utf8'));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Where an advert is, as a geocoder and a location filter can read it.
 *
 * Gratka lists the levels most general first. A city with county rights is a level of its own:
 * `[voivodeship, town, district, sub-district]`. Everywhere else the second level is the county,
 * whose name is a lowercase adjective (`krakowski`), followed by the municipality and the village:
 * `[voivodeship, county, municipality, village]`. The county says little about where a house is,
 * so it is left out.
 *
 * @param {Object|null|undefined} location The card's `location`.
 * @returns {string|null}
 */
function addressOf(location) {
  const levels = (location?.location ?? []).filter((level) => typeof level === 'string' && level.trim());
  const [province, second, ...rest] = levels.map((level) => level.trim());
  const street = typeof location?.street === 'string' ? location.street.trim() : '';
  const parts =
    second != null && /^\p{Ll}/u.test(second)
      ? // [voivodeship, county, municipality, village]: the village, then the municipality it belongs to.
        [street, rest[1] ?? rest[0], rest[0], province]
      : // [voivodeship, town, district, sub-district]: the street, or the finest district without one.
        [street || rest.at(-1), second, province];
  const present = parts.filter(Boolean);
  return present.length ? [...new Set(present)].join(', ') : null;
}

/**
 * The living space. The card's `area` is cut to whole square metres, and the price per square metre
 * it also carries was worked out from the exact one, so the exact figure is recovered from those two
 * where they agree with `area`.
 * @param {Object} raw A Gratka search card.
 * @returns {number|null}
 */
function sizeOf(raw) {
  const area = numberOf(raw.area);
  const price = numberOf(raw.price?.amount);
  const perSquareMetre = numberOf(raw.priceM2?.amount);
  if (area == null || price == null || perSquareMetre == null) return area;
  const exact = Math.round((price / perSquareMetre) * 100) / 100;
  return exact >= area && exact < area + 1 ? exact : area;
}

/**
 * @param {Object} raw A Gratka search card.
 * @returns {ParsedListing}
 */
function normalize(raw) {
  const images = (raw.photos ?? []).map((photo) => ({ url: photoUrl(photo?.id) })).filter((image) => image.url);
  const headline = typeof raw.advertisementText === 'string' ? raw.advertisementText.trim() : '';
  const fallback = typeof raw.title === 'string' ? raw.title.trim() : '';
  return {
    id: buildHash(String(raw.id)),
    title: headline || (fallback ? fallback[0].toUpperCase() + fallback.slice(1) : null),
    link: typeof raw.url === 'string' && ADVERT_PATH.test(raw.url) ? `${BASE_URL}${raw.url.slice(1)}` : null,
    price: numberOf(raw.price?.amount),
    currency: 'PLN',
    size: sizeOf(raw),
    rooms: roomsOf(raw.numberOfRooms),
    address: addressOf(raw.location),
    description: typeof raw.description === 'string' ? raw.description.trim() || null : null,
    publishedAt: addedAt(raw.addedAt),
    image: images[0]?.url ?? null,
    images,
  };
}

/** @type {ProviderConfig} */
const config = {
  url: null,
  requiredFieldNames: ['id', 'title', 'link'],
  crawlContainer: null,
  crawlFields: {},
  sortByDateParam: 'sort=newest',
  priceRangeParams: { min: 'cena-calkowita:min', max: 'cena-calkowita:max' },
  needsBrowser: false,
  getListings,
  normalize,
};

export const metaInformation = {
  id: 'gratka',
  name: 'Gratka',
  baseUrl: BASE_URL,
  countries: ['pl'],
  currency: 'PLN',
};

/**
 * @param {{url: string, enabled?: boolean}} sourceConfig
 * @param {string[]} [blacklist]
 * @returns {ProviderConfig}
 */
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  filter: (listing) =>
    listing.title != null && !isOneOf(listing.title, blacklist) && !isOneOf(listing.description, blacklist),
});

export { config };
