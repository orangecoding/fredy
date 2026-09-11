/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Casa.it, one of the three national portals Italian agencies publish to.
 *
 * The search page is a server rendered React application that hands its store to the browser as
 * `window.__INITIAL_STATE__`, and the results are read out of that store rather than out of the
 * cards: it carries the price as a number, the surface, the rooms and the coordinates, none of
 * which survive into the markup in a form worth parsing.
 *
 * The portal answers a search in one of two shapes and this provider reads both. A town search
 * ("/affitto/residenziale/roma/") fills the store's `search`; a map search ("/srp/map/?geopolygon=...")
 * leaves that half empty and fills `searchMap` instead. The entries are the same either way, so one
 * `normalize` reads both, and both count their pages with `page` and report how many there are.
 *
 * Neither shape need be rendered. The api the android app talks to answers both, on a host that is
 * not behind the wall and asks for no credentials, and it sorts by publication date - which the
 * page does not offer. `lib/services/casa/` reads a url into a search that api takes.
 *
 * Searches outside the API translator use the run's browser.
 */

import { buildHash, isOneOf, sleep } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import { sanitize } from '../utils/priceExtractors.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import { searchListings } from '../services/casa/search.js';
import { parseCasaUrl } from '../services/casa/web-translator.js';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.casa.it';

/** Where casa.it serves the photos its listings name by path. */
const IMAGE_CDN = 'https://images-1.casa.it';

/** The shape of the timestamps the api stamps an advert with (`20260826T003616Z`). */
const CASA_TIMESTAMP = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

/**
 * Read one of the api's compact timestamps into epoch milliseconds.
 *
 * `Date.parse` refuses the format, so it is read by hand. Everything casa.it stamps an advert with
 * is UTC - the trailing `Z` is load-bearing - and the fields are fixed width, which is why the
 * positions alone are enough.
 *
 * @param {unknown} value The api's `modified` or `last_relevant_update`.
 * @returns {number|undefined} Epoch milliseconds, or undefined when there is no readable stamp.
 */
function casaTimestamp(value) {
  const match = typeof value === 'string' ? value.match(CASA_TIMESTAMP) : null;
  if (match == null) return undefined;
  const [, y, m, d, h, min, s] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s));
}

/**
 * The size segment the photo path has to carry. The CDN answers a bare `/listing/...` path with a
 * 400 "invalid uri format" - every url it serves is a resized one, and the site itself renders its
 * gallery at this size.
 */
const IMAGE_SIZE = '800x600';

/** The query parameter naming the result page, which both search shapes answer to. */
const PAGE_PARAM = 'page';

/** How many result pages one run reads, so a search over a whole town cannot walk forever. */
const MAX_PAGES = 20;

/**
 * How long to wait between two result pages.
 *
 * DataDome reads the pace as well as the client: casa.it walls the third page of a walk that turns
 * them as fast as the browser renders. The jitter keeps the gaps from being identical, which is its
 * own signal.
 */
const PAGE_DELAY_MS = 2_000;
const PAGE_JITTER_MS = 1_500;

/**
 * The store is not embedded as JSON but as `JSON.parse("…")` around a JavaScript string literal,
 * so the payload arrives escaped twice. A JSON string literal is itself valid JSON, which is what
 * lets the outer layer be peeled off with the same parser rather than with an unescaper of our own.
 */
const INITIAL_STATE = /window\.__INITIAL_STATE__\s*=\s*JSON\.parse\(("(?:[^"\\]|\\.)*")\)/;

/**
 * Read a rendered search page: its results, and how many pages the search is spread over.
 *
 * @param {string|null|undefined} html the raw html of a search result page
 * @returns {{listings: any[], totalPages: number}|null} the page, or null when it carried no store
 */
export function parseSearch(html) {
  const match = html?.match(INITIAL_STATE);
  if (match == null) return null;

  try {
    const state = JSON.parse(JSON.parse(match[1]));
    // A map search leaves `search` empty and fills `searchMap` with the same entries.
    const search = state?.search?.list == null ? state?.searchMap : state.search;
    const list = search?.list;
    if (!Array.isArray(list)) return null;
    return { listings: list, totalPages: Number(search?.paginator?.totalPages) || 1 };
  } catch (error) {
    logger.error('Could not parse the casa.it store.', error?.message || error);
    return null;
  }
}

/**
 * Address one page of a search. Both shapes count their pages with the same parameter.
 *
 * @param {string} url the search url
 * @param {number} page the page to read, counted from one
 * @returns {string} the url of that page
 */
export function pageUrl(url, page) {
  const parsed = new URL(url);
  if (page > 1) {
    parsed.searchParams.set(PAGE_PARAM, String(page));
  } else {
    // Leave a first page exactly as the job wrote it rather than re-encoding its whole query.
    if (!parsed.searchParams.has(PAGE_PARAM)) return url;
    parsed.searchParams.delete(PAGE_PARAM);
  }
  return parsed.toString();
}

/**
 * Read a search off the rendered pages, which is what a url the api cannot be asked for costs.
 *
 * @param {string} url the search url, with the sort parameter already appended
 * @param {import('puppeteer').Browser} browser the shared browser of the current job run
 * @returns {Promise<any[]>} the raw results of every page the search has
 */
async function getListingsFromPage(url, browser) {
  const listings = [];
  const seen = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) await sleep(PAGE_DELAY_MS + Math.random() * PAGE_JITTER_MS);

    const html = await puppeteerExtractor(pageUrl(url, page), 'body', { browser, name: 'casa' });
    const search = parseSearch(html);
    if (search == null) {
      if (page === 1) logger.error('Casa.it returned a page without search results. The search URL may be wrong.');
      break;
    }

    const fresh = search.listings.filter((listing) => listing?.id != null && !seen.has(listing.id));
    for (const listing of fresh) seen.add(listing.id);
    listings.push(...fresh);

    // A page that repeats the one before it is the search served over again, which is what a page
    // past the last one comes back as.
    if (fresh.length === 0) break;

    if (page >= Math.min(search.totalPages, MAX_PAGES)) {
      if (search.totalPages > MAX_PAGES) {
        logger.warn(`Casa.it: stopped after ${MAX_PAGES} pages. Narrow the search to see the rest.`);
      }
      break;
    }
  }

  return listings;
}

/**
 * Read the adverts of a search, through the api where the url can be read into one.
 *
 * A failing api is treated as a url that could not be read: the website still holds the search, and
 * a run that renders it is better than a run that finds nothing.
 *
 * @param {string} url the search url, with the sort parameter already appended
 * @param {import('puppeteer').Browser} browser the shared browser of the current job run
 * @returns {Promise<any[]>} the raw results of every page the search has
 */
async function getListings(url, browser) {
  if (parseCasaUrl(url) == null) return [];

  try {
    const found = await searchListings(url);
    if (found != null) return found;
  } catch (error) {
    logger.error(`Casa.it's api did not answer (${error.message}); reading the website instead.`);
  }
  return getListingsFromPage(url, browser);
}

/**
 * Read a listing's price.
 *
 * The store carries the same figure twice: as a number on the map marker and as the display string
 * the card shows. The number is taken, because "1.900" read as a decimal is one euro ninety. A
 * development quoting a range reports its lower bound, which is the figure the card leads with.
 *
 * @param {any} price the `features.price` object
 * @returns {number|null} the price, or null when the advert keeps it off the site
 */
function readPrice(price) {
  if (price == null || price.show === false) return null;
  return sanitize(price.marker?.originalPrice) ?? extractNumber(price.min ?? price.value);
}

/**
 * Build the address shown on the listing.
 *
 * The street is only published when the agency allows it - `show_address` - and the district is
 * what is left when it does not. Either way the town has to follow, because a street name alone is
 * a street in half the country.
 *
 * The api names the same fields as the store does, so both sources read through this.
 *
 * @param {any} geoInfos the listing's geo block: `geoInfos` in the store, `property.geo` at the api
 * @returns {string|null} the address, or null when the listing names no place at all
 */
function buildAddress(geoInfos) {
  const place = geoInfos?.street || geoInfos?.district_name || geoInfos?.block_name;
  const parts = [place, geoInfos?.city].filter((part) => typeof part === 'string' && part.trim().length > 0);
  return parts.length === 0 ? null : parts.join(', ');
}

/**
 * Read an advert the api answered with.
 *
 * The api describes an advert in its own words, so each figure is taken from where it keeps it. The
 * link is built from the id rather than from the api's own pretty path, because that is the form
 * the store uses and an advert read either way then carries the same one.
 *
 * @param {any} o one advert of the api's answer
 * @returns {ParsedListing}
 */
function normalizeAdvert(o) {
  const geo = o?.property?.geo ?? {};
  const characteristic = o?.property?.characteristic ?? {};
  const price = o?.transaction?.price?.value;
  const photo = o?.media?.items?.[0]?.uri;

  return {
    id: buildHash(String(o?.listing_id ?? ''), price == null ? null : String(price)),
    title: o?.title?.it,
    link: o?.listing_id == null ? null : `${BASE_URL}/immobili/${o.listing_id}/`,
    price: sanitize(price),
    size: sanitize(characteristic.property_surface),
    rooms: sanitize(characteristic.rooms_count),
    address: buildAddress(geo),
    latitude: geo.lat,
    longitude: geo.lon,
    description: o?.description?.it,
    image: photo == null ? null : `${IMAGE_CDN}/${IMAGE_SIZE}${photo}`,
    // The api has no publication date, but it stamps every edit; the site's own "aggiornato il"
    // reads the same field. The rendered store carries neither, so a search read off the website
    // stays without one and keeps its created_at.
    publishedAt: casaTimestamp(o?.modified ?? o?.last_relevant_update),
  };
}

/**
 * @param {any} o one entry of the search store
 * @returns {ParsedListing}
 */
function normalizeEntry(o) {
  const features = o?.features ?? {};
  const geoInfos = o?.geoInfos ?? {};
  const price = readPrice(features.price);
  const photo = o?.media?.items?.[0]?.uri;

  return {
    id: buildHash(String(o?.id ?? ''), price == null ? null : String(price)),
    title: o?.title?.main,
    link: o?.uri == null ? null : `${BASE_URL}${o.uri}`,
    price,
    // Already numbers in the store, unlike every display string the html scrapers read.
    size: sanitize(features.mq),
    rooms: sanitize(features.rooms),
    address: buildAddress(geoInfos),
    latitude: geoInfos.lat,
    longitude: geoInfos.lon,
    description: o?.description,
    image: photo == null ? null : `${IMAGE_CDN}/${IMAGE_SIZE}${photo}`,
  };
}

/**
 * @param {any} o one advert, from either source
 * @returns {ParsedListing}
 */
function normalize(o) {
  return o?.listing_id == null ? normalizeEntry(o) : normalizeAdvert(o);
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
  // The results come from the store rather than from the markup, so there is nothing to crawl.
  crawlContainer: null,
  crawlFields: {},
  // Casa.it names its criteria `<field>_<direction>` and falls back to relevance for anything it
  // does not know, silently - `date` and `data_desc` both come back in the default order.
  sortByDateParam: 'sortType=date_desc',
  // ?priceMin=500&priceMax=1000 - what `lib/services/casa/search-filters.js` translates into the
  // api's `price` range.
  priceRangeParams: { min: 'priceMin', max: 'priceMax' },
  getListings,
  normalize,
  activityProbe: checkIfListingIsActive,
};

export const metaInformation = {
  countries: ['it'],
  name: 'Casa.it',
  baseUrl: `${BASE_URL}/`,
  id: 'casa',
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
