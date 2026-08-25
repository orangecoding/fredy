/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import { extractNumber } from '../utils/extract-number.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import logger from '../services/logger.js';
import { load } from 'cheerio';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://inberlinwohnen.de';
const MAX_PAGES = 100;
const DETAIL_SELECTORS = {
  'berlinovo.de': [
    '.field--name-field-interior2',
    '.field--name-field-interior',
    '.field--name-field-description',
    '.field--name-field-location-description',
  ],
  'degewo.de': ['#section-description .c-copy'],
  'gesobau.de': ['.immoContent > .immoMainContent > p:first-of-type', '.immoContent > .immoMainContent > h3 + p'],
  'gewobag.de': ['.details-description > #objektbeschreibung + p', '.details-description > #lage + p'],
  'howoge.de': ['main .section > strong + p.readmore__wrap'],
  'stadtundland.de': [],
  'wbm.de': ['.openimmo-detail__intro-text', '.openimmo-detail__transport-connection-text'],
};
const ALLOWED_HOSTS = new Set([...Object.keys(DETAIL_SELECTORS), 'inberlinwohnen.de']);
const ACTIVE_TEST_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {unknown}
 */
function findDetailValue(value, label) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findDetailValue(entry, label);
      if (found != null) return found;
    }
    return null;
  }

  if (value == null || typeof value !== 'object') return null;
  if (value.label === label) return value.value;

  for (const entry of Object.values(value)) {
    const found = findDetailValue(entry, label);
    if (found != null) return found;
  }
  return null;
}

/**
 * @param {string|null|undefined} snapshot
 * @returns {any}
 */
function parseItem(snapshot) {
  try {
    const item = JSON.parse(snapshot)?.data?.item;
    return (Array.isArray(item) ? item[0] : item) || {};
  } catch {
    return {};
  }
}

/**
 * Extract listing snapshots and pagination metadata from a server-rendered page.
 * @param {string} html
 * @returns {{listings: {id:string}[], totalPages:number, recognized:boolean, totalItems:number|null, itemsPerPage:number|null}}
 */
function parsePage(html) {
  const $ = load(html);
  const listings = [];
  let totalPages = 1;
  let recognized = false;
  let totalItems = null;
  let itemsPerPage = null;

  $('[wire\\:snapshot]').each((_, element) => {
    const snapshot = $(element).attr('wire:snapshot');
    if (!snapshot) return;

    try {
      const data = JSON.parse(snapshot)?.data;
      const item = Array.isArray(data?.item) ? data.item[0] : data?.item;
      if (
        item != null &&
        typeof item === 'object' &&
        firstScalarValue(item.id, item.objectId) != null &&
        typeof item.deeplink === 'string'
      ) {
        listings.push({ id: snapshot });
        recognized = true;
      }

      const itemIds = Array.isArray(data?.itemIds?.[0]) ? data.itemIds[0] : data?.itemIds;
      const pageSize = Number(data?.itemsPerPage);
      if (Array.isArray(itemIds) && Number.isFinite(pageSize) && pageSize > 0) {
        recognized = true;
        const pageCount = Math.max(1, Math.ceil(itemIds.length / pageSize));
        if (pageCount >= totalPages) {
          totalPages = pageCount;
          totalItems = itemIds.length;
          itemsPerPage = pageSize;
        }
      }
    } catch {
      // Other Livewire components may contain unrelated or incomplete snapshots.
    }
  });

  return { listings, totalPages, recognized, totalItems, itemsPerPage };
}

/**
 * Fetch every server-rendered result page so new jobs are not limited to page one.
 * @param {string} url
 * @param {any} browser
 * @param {typeof puppeteerExtractor} [extractPage]
 * @returns {Promise<{id:string}[]>}
 */
async function getListings(url, browser, extractPage = puppeteerExtractor) {
  async function fetchPage(page) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set('page', String(page));
    const html = await extractPage(pageUrl.href, 'body', { browser, name: 'inberlinwohnen' });
    if (!html) throw new Error(`InBerlinWohnen page ${page} could not be loaded.`);
    const parsed = parsePage(html);
    if (!parsed.recognized) {
      throw new Error(`InBerlinWohnen page ${page} did not contain the expected Livewire data.`);
    }
    if (parsed.totalItems != null && parsed.itemsPerPage != null) {
      const expectedListings = Math.min(
        parsed.itemsPerPage,
        Math.max(0, parsed.totalItems - (page - 1) * parsed.itemsPerPage),
      );
      if (parsed.listings.length < expectedListings) {
        throw new Error(
          `InBerlinWohnen page ${page} contained ${parsed.listings.length} of ${expectedListings} expected listings.`,
        );
      }
    }
    return parsed;
  }

  const firstPage = await fetchPage(1);
  if (firstPage.totalPages > MAX_PAGES) {
    throw new Error(`InBerlinWohnen returned ${firstPage.totalPages} pages, exceeding the safety limit.`);
  }

  const listings = [...firstPage.listings];
  for (let page = 2; page <= firstPage.totalPages; page++) {
    listings.push(...(await fetchPage(page)).listings);
  }
  const seen = new Set();
  return listings.filter((listing) => {
    const item = parseItem(listing.id);
    const key = firstScalarValue(item.id, item.objectId) ?? listing.id;
    if (seen.has(String(key))) return false;
    seen.add(String(key));
    return true;
  });
}

/**
 * @param {any} address
 * @returns {string|null}
 */
function normalizeAddress(address) {
  const value = Array.isArray(address) ? address[0] : address;
  if (value == null || typeof value !== 'object') return null;

  const street = [value.street, value.number].filter(Boolean).join(' ');
  const city = value.zipCode ? `${value.zipCode} Berlin` : null;
  return [street, city, value.district].filter(Boolean).join(', ') || null;
}

/**
 * @param {...unknown} values
 * @returns {string|number|null}
 */
function firstScalarValue(...values) {
  return values.find((value) => typeof value === 'number' || (typeof value === 'string' && value.trim())) ?? null;
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeLink(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, BASE_URL);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    return (url.protocol === 'http:' || url.protocol === 'https:') && ALLOWED_HOSTS.has(hostname) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Enrich a listing from its partner detail page when a supported selector is available.
 * @param {ParsedListing} listing
 * @param {any} browser
 * @param {typeof puppeteerExtractor} [extractDetails]
 * @returns {Promise<ParsedListing>}
 */
async function fetchDetails(listing, browser, extractDetails = puppeteerExtractor) {
  try {
    const hostname = new URL(listing.link).hostname.toLowerCase().replace(/^www\./, '');
    const selectors = DETAIL_SELECTORS[hostname];
    if (!selectors?.length) return listing;

    const html = await extractDetails(listing.link, null, {
      browser,
      name: `inberlinwohnen_details_${hostname.replaceAll('.', '_')}`,
    });
    if (!html) return listing;

    const $ = load(html);
    const details = [];
    for (const selector of selectors) {
      $(selector).each((_, element) => {
        const node = $(element).clone();
        node.find('script, style, noscript, button').remove();
        const text = node
          .text()
          .replace(/\s+/g, ' ')
          .replace(/^(Beschreibung|Ausstattung|Lageinformationen?)\s*:?\s*/i, '')
          .replace(/\s*mehr anzeigen\s*$/i, '')
          .trim();
        if (text.length >= 20 && !details.includes(text)) details.push(text);
      });
    }
    if (!details.length) return listing;

    return {
      ...listing,
      description: [listing.description, ...details].filter(Boolean).join('\n\n'),
    };
  } catch (error) {
    logger.warn(`Could not fetch InBerlinWohnen detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * Follow aggregator redirects and only report definitive gone responses as inactive.
 * @param {string} link
 * @returns {Promise<number>}
 */
async function isListingActive(link) {
  try {
    let currentUrl = normalizeLink(link);
    if (!currentUrl) return -1;
    const signal = AbortSignal.timeout(ACTIVE_TEST_TIMEOUT_MS);

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
      const response = await fetch(currentUrl, { redirect: 'manual', signal });
      if (response.status === 200) return 1;
      if (response.status === 404 || response.status === 410) return 0;
      if (response.status < 300 || response.status >= 400) return -1;

      const location = response.headers?.get('location');
      currentUrl = location ? normalizeLink(new URL(location, currentUrl).href) : null;
      if (!currentUrl) return -1;
    }
    return -1;
  } catch {
    return -1;
  }
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const item = parseItem(o.id);
  const originalId = firstScalarValue(item.objectId, item.id);
  const totalRent = firstScalarValue(findDetailValue(item.details, 'Gesamtmiete'), item.rentGross, item.rentNet);
  const company = typeof item.company?.[0]?.name === 'string' ? item.company[0].name.trim() : null;
  const wbs = findDetailValue(item.details, 'WBS');
  const description = [
    company ? `Anbieter: ${company}` : null,
    item.rentNet != null ? `Kaltmiete: ${item.rentNet} €` : null,
    item.extraCosts != null ? `Nebenkosten: ${item.extraCosts} €` : null,
    totalRent != null ? `Gesamtmiete: ${totalRent} €` : null,
    wbs ? `WBS: ${wbs}` : null,
    item.occupationDate ? `Bezugsfertig ab: ${item.occupationDate}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    id: originalId == null ? null : buildHash(String(originalId)),
    link: normalizeLink(item.deeplink),
    title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : null,
    price: extractNumber(totalRent),
    size: extractNumber(firstScalarValue(item.area)),
    rooms: extractNumber(firstScalarValue(item.rooms)),
    address: normalizeAddress(item.address),
    image:
      typeof item.imagePath === 'string' && item.imagePath.trim()
        ? new URL(`/img/${item.imagePath.replace(/^\/+/, '')}?q=90&fit=crop&fm=png&dpr=1`, BASE_URL).href
        : null,
    description: description || undefined,
  };
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList Terms the job wants filtered out.
 * @returns {boolean}
 */
function applyBlacklist(o, appliedBlackList) {
  return !isOneOf(o.title, appliedBlackList) && !isOneOf(o.description, appliedBlackList);
}

/**
 * @param {string} url
 * @returns {string}
 */
function normalizeSearchUrl(url) {
  const parsed = new URL(url);
  if (!['/mein-bereich/wohnungsfinder', '/mein-bereich/wohnungsfinder/'].includes(parsed.pathname)) return url;
  parsed.pathname = '/wohnungsfinder/';
  return parsed.href;
}

/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  crawlContainer: '[wire\\:snapshot*=\'"item":\']',
  sortByDateParam: null,
  waitForSelector: 'body',
  crawlFields: {
    id: '@wire:snapshot',
  },
  normalize,
  activityProbe: isListingActive,
  fetchDetails,
  getListings,
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
  url: normalizeSearchUrl(sourceConfig.url),
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});

export const metaInformation = {
  countries: ['de'],
  name: 'InBerlinWohnen',
  baseUrl: `${BASE_URL}/`,
  id: 'inberlinwohnen',
};

export { config };
