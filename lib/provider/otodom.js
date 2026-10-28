/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import { readNextData } from '../utils/priceExtractors.js';
import { publicationDate } from '../utils/publicationDate.js';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.otodom.pl/';
const MAX_PAGES = 5;
const ROOMS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10 };

/**
 * Read the server-rendered search, distinguishing an empty search from a changed schema.
 * @param {string} html
 * @returns {{items: Object[], pagination: Object}}
 */
export function parseSearchPage(html) {
  const search = readNextData(html)?.props?.pageProps?.data?.searchAds;
  const page = search?.pagination;
  if (
    !Array.isArray(search?.items) ||
    !Number.isInteger(page?.currentPage) ||
    page.currentPage < 1 ||
    !Number.isInteger(page.totalPages) ||
    page.totalPages < 0
  ) {
    throw new Error('Otodom returned no valid search payload. The page may be blocked or its format changed.');
  }
  return { items: search.items, pagination: page };
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
    !['otodom.pl', 'www.otodom.pl'].includes(searchUrl.hostname) ||
    searchUrl.port !== '' ||
    searchUrl.username !== '' ||
    searchUrl.password !== '' ||
    !/^\/pl\/wyniki\/sprzedaz\/dom\//.test(searchUrl.pathname)
  ) {
    throw new Error('Otodom supports Polish house-sale searches: /pl/wyniki/sprzedaz/dom/...');
  }
  searchUrl.searchParams.set('by', 'LATEST');
  searchUrl.searchParams.set('direction', 'DESC');
  const adverts = new Map();
  const slugs = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    searchUrl.searchParams.set('page', String(page));
    const response = await fetch(searchUrl.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'pl-PL,pl;q=0.9' },
      signal: AbortSignal.timeout(30_000),
      // Never follow a portal redirect to an unrelated host or a private address.
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Otodom search failed: ${response.status} ${response.statusText}`);
    const { items, pagination } = parseSearchPage(await response.text());
    if (pagination.currentPage !== page)
      throw new Error(`Otodom returned page ${pagination.currentPage} instead of ${page}.`);
    const before = adverts.size;
    for (const item of items) {
      if (item?.id != null && !adverts.has(item.id) && !slugs.has(item.slug)) {
        adverts.set(item.id, item);
        if (item.slug != null) slugs.add(item.slug);
      }
    }
    if (items.length === 0 || adverts.size === before || page >= pagination.totalPages) break;
    if (page === MAX_PAGES) logger.warn(`Otodom search stopped at the ${MAX_PAGES}-page limit.`);
  }
  return [...adverts.values()].filter(
    (item) =>
      // Development cards describe several properties, sometimes with only a per-m² starting price.
      !((item.investmentUnitsNumber > 0 || item.investmentUnitsAreaInSquareMeters != null) && item.totalPrice == null),
  );
}

/** @param {unknown} value @returns {number|null} */
function numberOf(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * @param {Object} raw An Otodom search card.
 * @returns {ParsedListing}
 */
function normalize(raw) {
  const location = raw.location;
  const address = location?.address;
  const hierarchy = location?.reverseGeocoding?.locations ?? [];
  const town = hierarchy.find((part) => ['city', 'city_or_village'].includes(part.locationLevel));
  const province = hierarchy.find((part) => part.locationLevel === 'voivodeship');
  const price = raw.hidePrice ? null : numberOf(raw.totalPrice?.value);
  if (raw.totalPrice?.currency != null && raw.totalPrice.currency !== 'PLN') {
    throw new Error(`Otodom returned unsupported currency: ${raw.totalPrice.currency}`);
  }
  const street = [address?.street?.name, address?.street?.number].filter(Boolean).join(' ');
  const parts = [street, address?.city?.name ?? town?.name, address?.province?.name ?? province?.name].filter(Boolean);
  const images = (raw.images ?? [])
    .map((image) => ({ url: image.large ?? image.medium ?? image.small }))
    .filter((image) => image.url);
  return {
    id: buildHash(String(raw.id), price == null ? null : String(price)),
    title: raw.title,
    link: typeof raw.slug === 'string' && /^[\w-]+$/.test(raw.slug) ? `${BASE_URL}pl/oferta/${raw.slug}` : null,
    price,
    currency: 'PLN',
    size: numberOf(raw.areaInSquareMeters),
    rooms: ROOMS[raw.roomsNumber] ?? null,
    address: parts.length ? [...new Set(parts)].join(', ') : null,
    description: raw.shortDescription ?? null,
    publishedAt: publicationDate(raw.dateCreated),
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
  sortByDateParam: 'by=LATEST&direction=DESC',
  priceRangeParams: { min: 'priceMin', max: 'priceMax' },
  needsBrowser: false,
  getListings,
  normalize,
};

export const metaInformation = {
  id: 'otodom',
  name: 'Otodom',
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
