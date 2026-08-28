/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import { readNextData } from '../utils/priceExtractors.js';
import { extractBuildingFacts, normalizeEnergyClass } from '../utils/buildingFacts.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.engelvoelkers.com';
const UPLOADCARE_URL = 'https://uploadcare.engelvoelkers.com';

/**
 * Engel & Völkers runs on Next.js and server side renders the whole search result into the
 * `__NEXT_DATA__` script tag. Reading that json is far more stable than scraping the markup,
 * whose css class names are build hashes that change with every deployment.
 *
 * @param {string|null|undefined} html the raw html of a search or exposé page
 * @returns {any|null} the parsed next.js payload or null when it is missing/malformed
 */
function parseNextData(html) {
  if (!html) return null;
  const raw = cheerio.load(html)('script#__NEXT_DATA__').first().text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Picks the data of one react-query entry out of the dehydrated state of a next.js page.
 *
 * @param {any} nextData the parsed next.js payload
 * @param {string} queryName the first element of the react-query key, e.g. 'listings'
 * @returns {any|null} the query's data or null when the query is not part of the page
 */
function findQueryData(nextData, queryName) {
  const queries = nextData?.props?.pageProps?.dehydratedState?.queries;
  if (!Array.isArray(queries)) return null;
  const query = queries.find((entry) => Array.isArray(entry?.queryKey) && entry.queryKey[0] === queryName);
  return query?.state?.data ?? null;
}

/**
 * Engel & Völkers reports every numeric attribute as a `{min, max}` range, even when both ends
 * are identical. Only development projects actually span a range, so the lower bound is used.
 *
 * @param {{min?: number, max?: number}|null|undefined} range the range as delivered by the api
 * @returns {number|null} the lower bound or null when the attribute is not set
 */
function rangeStart(range) {
  if (range == null) return null;
  return extractNumber(range.min ?? range.max);
}

/**
 * Builds the exposé url. The locale prefix is taken from the configured search url so that
 * non-German shops (`/es/en/propertysearch`) keep linking into their own locale.
 *
 * @param {string|null|undefined} id the listing uuid
 * @returns {string|null} the absolute exposé url or null when there is no id
 */
function exposeLink(id, runUrl) {
  if (!id) return null;
  try {
    const searchUrl = new URL(runUrl ?? `${BASE_URL}/de/de/propertysearch`);
    const localePrefix = searchUrl.pathname.replace(/\/[^/]*\/?$/, '');
    return new URL(`${localePrefix}/exposes/${id}`, searchUrl.origin).href;
  } catch {
    return `${BASE_URL}/de/de/exposes/${id}`;
  }
}

/**
 * The address components arrive ordered from coarse to fine (country → region → district).
 * Reversing them yields the same reading order the search result cards use.
 *
 * @param {{text?: string}[]|null|undefined} addressComponents the components of a listing
 * @returns {string|null} e.g. 'Dahlem, Berlin, Deutschland' or null when unavailable
 */
function buildAddress(addressComponents) {
  if (!Array.isArray(addressComponents)) return null;
  const parts = addressComponents
    .map((component) => component?.text)
    .filter((text) => typeof text === 'string' && text.trim().length > 0)
    .reverse();
  return parts.length === 0 ? null : parts.join(', ');
}

/**
 * Images are referenced by their uploadcare id only, so the delivery url has to be assembled.
 *
 * @param {any} listing the raw listing
 * @returns {string|null} url of the title image or null when the listing has no images
 */
function buildImageUrl(listing) {
  const id = listing?.uploadCareImages?.[0]?.id ?? listing?.uploadCareImageIds?.[0];
  return id == null ? null : `${UPLOADCARE_URL}/${id}/-/format/jpeg/-/resize/1080x/`;
}

/**
 * Reads the listings out of a server rendered search result page.
 *
 * @param {string} html the raw html of the search result page
 * @returns {any[]|null} the raw listings or null when the page did not contain the expected data
 */
export function parseListings(html) {
  const data = findQueryData(parseNextData(html), 'listings');
  if (data == null || !Array.isArray(data.listings)) return null;
  return data.listings.map((entry) => entry?.listing).filter(Boolean);
}

/**
 * @param {string} url the (already sorted) search url
 * @param {import('puppeteer').Browser} browser the shared browser of the current job run
 * @returns {Promise<any[]>} the raw listings of the first result page
 */
async function getListings(url, browser) {
  const html = await puppeteerExtractor(url, 'body', { browser, name: 'engelVoelkers' });
  const listings = parseListings(html);
  if (listings == null) {
    throw new Error('Engel & Völkers search page did not contain the expected Next.js data.');
  }
  return listings;
}

/**
 * Enriches a listing with the exposé and location text, and with the energy efficiency class. The
 * search result page carries the headline only, so without this the description stays empty.
 *
 * @param {ParsedListing} listing the listing scraped from the search result page
 * @param {import('puppeteer').Browser} browser the shared browser of the current job run
 * @returns {Promise<ParsedListing>} the enriched listing, or the untouched one on failure
 */
async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, 'body', { browser, name: 'engelVoelkers_details' });
    const detail = findQueryData(parseNextData(html), 'listing')?.listing;
    if (detail == null) return listing;

    const description = [detail.profile?.description, detail.profile?.locationDescription]
      .filter((text) => typeof text === 'string' && text.trim().length > 0)
      .join('\n\n');

    const fullDescription = description || listing.description;

    // The payload has no construction year of its own, so the description is the only source. The
    // class it does state is the better one, so it wins over whatever the text says.
    return {
      ...listing,
      address: listing.address || buildAddress(detail.addressComponents),
      description: fullDescription,
      buildYear: extractBuildingFacts(fullDescription).buildYear,
      energyClass: normalizeEnergyClass(detail.energyClassNormalized?.min ?? detail.energyClassNormalized?.max),
    };
  } catch (error) {
    logger.warn(`Could not fetch Engel & Völkers exposé for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o, runUrl) {
  // buy listings carry a sales price, rentals the net rent - the total rent is only a fallback
  // for shops that do not break the rent down into base rent and utilities
  const price = rangeStart(o.price?.salesPrice) ?? rangeStart(o.price?.rentNet) ?? rangeStart(o.price?.rentTotal);
  return {
    // buildHash only accepts strings, so the price has to be stringified to take part in the hash
    id: buildHash(o.id, price == null ? null : String(price)),
    link: exposeLink(o.id, runUrl),
    title: o.profile?.title?.replace(/\s+/g, ' ').trim() || '',
    price,
    size: rangeStart(o.area?.livingSurface) ?? rangeStart(o.area?.totalSurface),
    rooms: rangeStart(o.rooms),
    address: buildAddress(o.addressComponents),
    image: buildImageUrl(o),
    description: o.profile?.description ?? null,
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
  return titleNotBlacklisted && descNotBlacklisted;
}

/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  // the listings are read from the embedded next.js payload, not from the markup
  crawlContainer: null,
  crawlFields: null,
  // an unknown sorting value makes the site silently drop every filter, so this has to stay
  // one of the values the sort dropdown offers
  sortByDateParam: 'sortingOptions[]=CREATED_AT_DESC',
  waitForSelector: 'body',
  normalize,
  getListings,
  fetchDetails,
  activityProbe: checkIfListingIsActive,
  priceTracking: {
    /**
     * Reads the exposé's own price object rather than its JSON-LD offer, so the salesPrice /
     * rentNet / rentTotal precedence and the "lower bound of the range" rule stay in one place -
     * {@link normalize} and this must not be able to disagree about which of three prices a
     * listing has.
     *
     * @param {string} html
     * @returns {number|null}
     */
    extract: (html) => {
      const queries = readNextData(html)?.props?.pageProps?.dehydratedState?.queries ?? [];
      const price = queries.find((query) => query?.queryKey?.[0] === 'listing')?.state?.data?.listing?.price;
      if (price == null) return null;
      return rangeStart(price.salesPrice) ?? rangeStart(price.rentNet) ?? rangeStart(price.rentTotal);
    },
  },
};

/**
 * Build a run-scoped provider configuration.
 *
 * Returns a fresh object on every call instead of mutating module-level state. Two jobs can be in
 * flight at once - a manual run started while the scheduler is working through the others - and a
 * shared mutable config meant the second job overwrote the first job's URL and blacklist mid-run,
 * so listings were fetched for one job and stored under another.
 *
 * @param {{url: string, enabled?: boolean}} sourceConfig The job's entry for this provider.
 * @param {string[]} [blacklist] Terms to filter listings out by.
 * @returns {ProviderConfig} A configuration usable by a single pipeline run.
 */
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  // The run's search URL is bound here rather than read from the module-level `config`:
  // that object's `url` is null on the static template and `createConfig` returns a copy,
  // so the module binding is never assigned. Reading it produced a fallback URL for every
  // job regardless of what the user configured.
  normalize: (o) => normalize(o, sourceConfig.url),
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});

export const metaInformation = {
  countries: ['de'],
  name: 'Engel & Völkers',
  baseUrl: `${BASE_URL}/`,
  id: 'engelVoelkers',
};

export { config };
