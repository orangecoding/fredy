/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import { readNextData } from '../utils/priceExtractors.js';
import { publicationDate } from '../utils/publicationDate.js';
import { queryPageUrl } from '../utils/pageUrl.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.otodom.pl/';
// MORE means "more than ten".
const ROOMS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, MORE: 11 };

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
 * Fetch one result page of newest adverts, keeping the user's filters intact.
 *
 * The page is the URL's `page` (see `pageUrl`); the pipeline asks for further pages when the job
 * wants them. A later page answered with a `currentPage` other than the one asked for is a page the
 * search does not have, so it reads as empty and ends the walk rather than failing the run.
 *
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
  // Otodom redirects otodom.pl and trailing slashes, and redirects are refused.
  searchUrl.hostname = 'www.otodom.pl';
  searchUrl.pathname = searchUrl.pathname.replace(/\/+$/, '');
  searchUrl.searchParams.set('by', 'LATEST');
  searchUrl.searchParams.set('direction', 'DESC');
  const page = Math.max(1, Math.trunc(Number(searchUrl.searchParams.get('page'))) || 1);
  searchUrl.searchParams.set('page', String(page));
  const response = await fetch(searchUrl.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'pl-PL,pl;q=0.9' },
    signal: AbortSignal.timeout(30_000),
    // Never follow a redirect to another host.
    redirect: 'manual',
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`Otodom redirected the search to ${response.headers.get('location')}; save that URL instead.`);
  }
  if (!response.ok) throw new Error(`Otodom search failed: ${response.status} ${response.statusText}`);
  const { items, pagination } = parseSearchPage(await response.text());
  if (pagination.currentPage !== page) {
    if (page > 1) return [];
    throw new Error(`Otodom returned page ${pagination.currentPage} instead of ${page}.`);
  }
  const adverts = new Map();
  const slugs = new Set();
  for (const item of items) {
    if (item?.id != null && !adverts.has(item.id) && !slugs.has(item.slug)) {
      adverts.set(item.id, item);
      if (item.slug != null) slugs.add(item.slug);
    }
  }
  return [...adverts.values()].filter((item) => {
    // Development cards group several units and may have no single price.
    const isDevelopment = item.investmentUnitsNumber > 0 || item.investmentUnitsAreaInSquareMeters != null;
    if (isDevelopment && item.totalPrice == null) return false;
    // Listings are stored as PLN.
    return item.totalPrice?.currency == null || item.totalPrice.currency === 'PLN';
  });
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
  const street = [address?.street?.name, address?.street?.number].filter(Boolean).join(' ');
  const parts = [street, address?.city?.name ?? town?.name, address?.province?.name ?? province?.name].filter(Boolean);
  const images = (raw.images ?? [])
    .map((image) => ({ url: image.large ?? image.medium ?? image.small }))
    .filter((image) => image.url);
  return {
    // Without priceTracking, a price in the hash would re-announce every price change.
    id: buildHash(String(raw.id)),
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
  // `page=N`, set on page 1 too, as the search has always been requested.
  pageUrl: queryPageUrl('page', { onFirstPage: true }),
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
