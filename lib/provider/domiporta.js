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

const BASE_URL = 'https://www.domiporta.pl/';
const MAX_PAGES = 5;
// "Od najnowszych": newest on the portal first. The portal's unlabelled default, SortDateDescending, is not.
const NEWEST_FIRST = 'InsertionDateDescending';
const SEARCH_PATH = /^\/(?:dom|mieszkanie)\/(?:sprzedam|wynajme)(?:\/|$)/;
// An advert: /nieruchomosci/<slug>/<id>. One flat of a development: /nowe/ogloszenie/<slug>_<id>.
const ADVERT_PATH = /^\/nieruchomosci\/[\w-]+\/(\d+)$/;
const UNIT_PATH = /^\/nowe\/ogloszenie\/[\w-]+_(\d+)$/;
const INVALID_PAGE = 'Domiporta returned no valid search page. The page may be blocked or its format changed.';

/**
 * Read the adverts off the search page's schema.org data, distinguishing an empty search from a
 * changed page.
 *
 * A search with results describes them as an `ItemList` of `RealEstateListing`s. An empty search
 * has no list, but still the page skeleton every search page shares (`.listing__container`);
 * without either, the page is not a search result. A list none of whose entries is a Domiporta
 * advert is a changed page too, rather than a search with nothing new.
 *
 * @param {string} html
 * @returns {{items: Object[], linkedPages: number[]}} schema.org listings, and the page numbers the
 *   pagination links to.
 */
export function parseSearchPage(html) {
  const $ = cheerio.load(html ?? '');
  let list = null;
  for (const node of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data = JSON.parse($(node).text());
      const found = (data?.['@graph'] ?? [data]).find((entry) => entry?.['@type'] === 'ItemList');
      if (found != null) list = found;
    } catch {
      // Another block may still hold the list.
    }
  }
  if (list == null && $('.listing__container').length === 0) throw new Error(INVALID_PAGE);
  if (list != null && !Array.isArray(list.itemListElement)) throw new Error(INVALID_PAGE);
  const items = (list?.itemListElement ?? []).map((element) => element?.item).filter((item) => item != null);
  if (list != null && list.itemListElement.length > 0 && !items.some((item) => advertIdOf(item) != null)) {
    throw new Error(INVALID_PAGE);
  }
  const linkedPages = $('a[href]')
    .toArray()
    .map((node) => Number(/[?&]PageNumber=(\d+)(?:&|$)/.exec($(node).attr('href') ?? '')?.[1]))
    .filter(Number.isInteger);
  return { items, linkedPages };
}

/**
 * The advert's path on www.domiporta.pl, when its url is one.
 * @param {unknown} item
 * @returns {string|null}
 */
function advertPathOf(item) {
  try {
    const url = new URL(typeof item?.url === 'string' ? item.url : '');
    return url.protocol === 'https:' && url.hostname === 'www.domiporta.pl' ? url.pathname : null;
  } catch {
    return null;
  }
}

/**
 * The advert's number. A development's flats are numbered apart from the adverts, so theirs is
 * kept apart as well.
 * @param {unknown} item
 * @returns {string|null}
 */
function advertIdOf(item) {
  const path = advertPathOf(item) ?? '';
  const advert = ADVERT_PATH.exec(path)?.[1];
  if (advert != null) return advert;
  const unit = UNIT_PATH.exec(path)?.[1];
  return unit != null ? `nowe/${unit}` : null;
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
    !['domiporta.pl', 'www.domiporta.pl'].includes(searchUrl.hostname) ||
    searchUrl.port !== '' ||
    searchUrl.username !== '' ||
    searchUrl.password !== '' ||
    !SEARCH_PATH.test(searchUrl.pathname)
  ) {
    throw new Error('Domiporta supports Polish flat and house searches: /dom|mieszkanie/sprzedam|wynajme/...');
  }
  // The bare domain only redirects to www.
  searchUrl.hostname = 'www.domiporta.pl';
  searchUrl.searchParams.set('SortingOrderDirection', NEWEST_FIRST);
  const adverts = new Map();
  const seen = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    searchUrl.searchParams.set('PageNumber', String(page));
    const response = await fetch(searchUrl.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'pl-PL,pl;q=0.9' },
      signal: AbortSignal.timeout(30_000),
      // Redirects are never followed, so a request cannot be sent on to another host.
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) {
      // The last page redirects to an earlier page. Keep prior results on any later redirect; the
      // pipeline never treats a missing result in one run as a removal.
      if (page > 1) break;
      throw new Error(`Domiporta redirected the search to ${response.headers.get('location') ?? 'another page'}.`);
    }
    if (!response.ok) throw new Error(`Domiporta search failed: ${response.status} ${response.statusText}`);
    const { items, linkedPages } = parseSearchPage(await response.text());
    const before = seen.size;
    for (const item of items) {
      if (typeof item.url === 'string') seen.add(item.url);
      const id = advertIdOf(item);
      if (id != null && !adverts.has(id)) adverts.set(id, item);
    }
    // A page counts as new when anything on it is, not only what is kept.
    if (items.length === 0 || seen.size === before || !linkedPages.includes(page + 1)) break;
    if (page === MAX_PAGES) logger.warn(`Domiporta search stopped at the ${MAX_PAGES}-page limit.`);
  }
  // Listings default to PLN; an explicitly non-PLN advert is skipped rather than failing the run.
  return [...adverts.values()].filter((item) => {
    const currency = item.offers?.priceCurrency;
    return currency == null || currency === 'PLN';
  });
}

/** @param {unknown} value @returns {number|null} */
function numberOf(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Text as a reader sees it: Domiporta leaves HTML entities (`&nbsp;`) in its descriptions.
 * @param {unknown} text
 * @returns {string|null}
 */
function plainText(text) {
  if (typeof text !== 'string') return null;
  const decoded = cheerio.load(`<p>${text}</p>`, null, false).text();
  return decoded.replace(/\s+/g, ' ').trim() || null;
}

/**
 * The day the advert was posted. Domiporta gives a bare date, read as midnight in Poland.
 * @param {unknown} value
 * @returns {number|undefined}
 */
function postedAt(value) {
  const date = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!date) return undefined;
  const [year, month, day] = date.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return undefined;
  return wallClockInZone({ year, month, day }, 'Europe/Warsaw');
}

/**
 * Split Domiporta's name into the headline and the place it appends to it.
 *
 * Names read "Headline: Place: Street" ("Dom z ogrodem: Kraków Nowa Huta: ul. Stare Wiślisko"), or
 * "Headline: Place" for an advert without a street. The appended place often names a district that
 * the structured address leaves out, so it belongs in the address rather than in the title.
 *
 * @param {unknown} name
 * @param {string} street The structured street, or ''.
 * @param {string} locality The structured town, or ''.
 * @returns {{headline: string|null, place: string|null}}
 */
function splitName(name, street, locality) {
  if (typeof name !== 'string') return { headline: null, place: null };
  const segments = name.split(': ').map((segment) => segment.trim());
  if (segments.length > 1 && street && segments.at(-1) === street) segments.pop();
  const place = segments.length > 1 && locality && segments.at(-1).startsWith(locality) ? segments.pop() : null;
  // A district named like its estate comes doubled: "Kraków Podgórze Duchackie Podgórze Duchackie".
  return { headline: segments.join(': ') || null, place: place?.replace(/ (.+) \1$/, ' $1') ?? null };
}

/**
 * @param {Object} raw A schema.org `RealEstateListing` from the search page.
 * @returns {ParsedListing}
 */
function normalize(raw) {
  const home = raw.offers?.itemOffered;
  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  const street = text(home?.address?.streetAddress);
  const locality = text(home?.address?.addressLocality);
  const { headline, place } = splitName(raw.name, street, locality);
  const parts = [street, place ?? locality, text(home?.address?.addressRegion)].filter(Boolean);
  const path = advertPathOf(raw);
  let image = null;
  try {
    image = typeof raw.image === 'string' && new URL(raw.image).protocol === 'https:' ? raw.image : null;
  } catch {
    image = null;
  }
  return {
    id: buildHash(advertIdOf(raw) ?? String(raw.url)),
    title: headline,
    link: path != null && (ADVERT_PATH.test(path) || UNIT_PATH.test(path)) ? `${BASE_URL}${path.slice(1)}` : null,
    price: numberOf(raw.offers?.price),
    currency: 'PLN',
    size: numberOf(home?.floorSize?.value),
    rooms: numberOf(home?.numberOfRooms),
    address: parts.length ? [...new Set(parts)].join(', ') : null,
    description: plainText(raw.description),
    publishedAt: postedAt(raw.datePosted),
    image,
    images: image ? [{ url: image }] : [],
  };
}

/** @type {ProviderConfig} */
const config = {
  url: null,
  requiredFieldNames: ['id', 'title', 'link'],
  crawlContainer: null,
  crawlFields: {},
  sortByDateParam: `SortingOrderDirection=${NEWEST_FIRST}`,
  priceRangeParams: { min: 'Price.From', max: 'Price.To' },
  needsBrowser: false,
  getListings,
  normalize,
};

export const metaInformation = {
  id: 'domiporta',
  name: 'Domiporta',
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
