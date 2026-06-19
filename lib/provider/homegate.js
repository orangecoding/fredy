/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { ProxyAgent } from 'undici';
import { buildHash, isOneOf } from '../utils.js';
import { extractNumber } from '../utils/extract-number.js';
import logger from '../services/logger.js';
import { getSettings } from '../services/storage/settingsStorage.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];

/**
 * Fetch listings by requesting the Homegate search page HTML through the
 * configured residential proxy and extracting the server-side-rendered JSON
 * from `window.__INITIAL_STATE__`.
 *
 * DataDome challenges are browser JS — the server still returns real SSR HTML
 * (including the full listing JSON) when the request comes from a residential
 * IP with a convincing Chrome fingerprint. No headless browser is needed, so
 * this approach works on ARM64 without any fingerprint issues.
 *
 * Requires `proxyUrl` to be configured in Fredy settings (Settings → Execution).
 * Without a residential Swiss proxy the request will be blocked by DataDome.
 *
 * @param {string} url - The configured Homegate search URL (sort params from
 *   queryStringMutator are already appended and are passed through as-is).
 * @returns {Promise<object[]>} Raw listing objects for the normalize() pipeline step.
 */
async function getListings(url) {
  const settings = await getSettings();
  const proxyUrl = typeof settings?.proxyUrl === 'string' ? settings.proxyUrl.trim() : '';

  /** @type {import('undici').RequestInit} */
  const fetchOptions = {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9,de-CH;q=0.8',
      'Cache-Control': 'no-cache',
    },
  };

  if (proxyUrl) {
    fetchOptions.dispatcher = new ProxyAgent(proxyUrl);
    logger.debug(`[Homegate] Fetching via proxy (${proxyUrl.replace(/:[^:@/]+@/, ':***@')})`);
  } else {
    logger.warn('[Homegate] No proxy configured — request may be blocked by DataDome');
  }

  logger.debug(`[Homegate] Fetching search page: ${url}`);
  let html;
  try {
    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
      logger.error(`[Homegate] HTTP ${response.status} fetching search page`);
      return [];
    }
    html = await response.text();
  } catch (err) {
    logger.error(`[Homegate] Fetch failed: ${err.message}`);
    return [];
  }

  // Extract the SSR JSON blob embedded as window.__INITIAL_STATE__ = {...};
  // Homegate uses a space before the equals sign.
  const marker = html.includes('window.__INITIAL_STATE__ =')
    ? 'window.__INITIAL_STATE__ ='
    : 'window.__INITIAL_STATE__=';
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) {
    logger.warn('[Homegate] window.__INITIAL_STATE__ not found — DataDome may have intercepted the response');
    return [];
  }
  const scriptEnd = html.indexOf('</script>', markerIdx);
  let jsonStr = (
    scriptEnd !== -1 ? html.slice(markerIdx + marker.length, scriptEnd) : html.slice(markerIdx + marker.length)
  ).trim();
  if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1);

  let state;
  try {
    state = JSON.parse(jsonStr);
  } catch (err) {
    logger.error(`[Homegate] Failed to parse __INITIAL_STATE__: ${err.message}`);
    return [];
  }

  const listings = state?.resultList?.search?.fullSearch?.result?.listings ?? [];
  logger.debug(`[Homegate] Extracted ${listings.length} listings from __INITIAL_STATE__`);

  if (listings.length === 0) {
    logger.warn('[Homegate] __INITIAL_STATE__ found but listings array is empty');
    return [];
  }

  return listings.map((entry) => {
    const listing = entry.listing ?? entry;
    const offerType = listing.offerType ?? 'RENT';
    const pathPrefix = offerType === 'BUY' ? 'kaufen' : 'mieten';
    const chars = listing.characteristics ?? {};
    const prices = listing.prices ?? {};
    const addr = listing.address ?? {};
    const loc =
      listing.localization?.de ??
      listing.localization?.fr ??
      listing.localization?.it ??
      listing.localization?.en ??
      {};
    const text = loc.text ?? {};
    const attachments = loc.attachments ?? [];

    const addressStr = [addr.street, addr.postalCode, addr.locality].filter(Boolean).join(', ') || null;
    const rentAmount = prices.rent?.gross ?? prices.buy?.price ?? null;
    const priceStr = rentAmount != null ? `CHF ${rentAmount}` : null;
    const imgAttachment = attachments.find((a) => a.type === 'IMAGE');
    const listingId = listing.id ?? entry.id;

    return {
      id: `https://www.homegate.ch/${pathPrefix}/${listingId}`,
      link: `https://www.homegate.ch/${pathPrefix}/${listingId}`,
      title: text.title ?? null,
      description: text.description ?? null,
      price: priceStr,
      rooms: chars.numberOfRooms ?? null,
      size: chars.livingSpace != null ? `${chars.livingSpace}` : null,
      address: addressStr,
      image: imgAttachment?.url ?? null,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses a Swiss formatted price such as "CHF 1,714.–" or "CHF 2,250.50" into a number.
 * Swiss notation uses ',' as the thousands separator, '.' as the decimal separator and
 * '.–' as a placeholder for ".00" - the opposite of the German notation handled by
 * `extractNumber`.
 * @param {string|undefined|null} str
 * @returns {number|null}
 */
function parsePrice(str) {
  if (str == null) return null;
  const cleaned = str
    .replace(/CHF/gi, '')
    .replace(/[’'`]/g, '')
    .replace(/,/g, '')
    .replace(/[–-]\s*$/, '')
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  // Extract the numeric listing ID which is stable across language variants
  // (/rent/ vs /mieten/) and query params: "/mieten/4003179219?pos=3" → "4003179219".
  const rawHref = o.id || o.link || '';
  const numericId = rawHref.match(/\/(\d{6,})/)?.[1] ?? rawHref.split('?')[0];
  const id = buildHash(numericId);

  // Normalize CDN image URL to a consistent high-res Cloudinary transform.
  // Multi-image listings expose a thumbnail strip (t_listing_card_117x102); single-image
  // listings load the first slide directly without any transform in the URL.
  let image = null;
  if (o.image) {
    if (o.image.includes('t_listing_card_117x102')) {
      image = o.image.replace('t_listing_card_117x102', 't_listing_card_1074x585');
    } else if (o.image.includes('/listings/v2/') && !o.image.includes('/f_auto/')) {
      image = o.image.replace('/listings/v2/', '/f_auto/t_listing_card_1074x585/listings/v2/');
    } else {
      image = o.image;
    }
  }

  return {
    id,
    link: o.link,
    title: o.title || o.address || null,
    price: parsePrice(o.price),
    currency: 'CHF',
    size: extractNumber(o.size),
    rooms: o.rooms != null ? parseFloat(o.rooms) : null,
    address: o.address,
    image,
    description: o.description,
  };
}

/**
 * @param {ParsedListing} o
 * @returns {boolean}
 */
function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'description'],
  url: null,
  sortByDateParam: 'sortBy=dateCreated,desc',
  // crawlContainer / crawlFields / puppeteerOptions are kept so the browser fallback
  // still works if getListings is removed. The pipeline uses getListings first when present.
  crawlContainer: 'div[data-test="result-list-item"]',
  waitForSelector: 'div[data-test="result-list"]',
  puppeteerOptions: {
    puppeteerTimeout: 120_000,
    puppeteerSelectorTimeout: 90_000,
    preNavigateUrl: 'https://www.homegate.ch/',
    ignoredStatusCodes: [403],
    autoScroll: true,
    autoScrollDelay: 800,
    autoScrollItemSelector: 'div[data-test="result-list-item"]',
    autoScrollDedupeSelector: 'a[href*="homegate.ch"]',
  },
  crawlFields: {
    id: 'a@href',
    link: 'a@href',
    price: 'span[class*="HgListingCard_price"] | trim',
    rooms: 'div[class*="HgListingRoomsLivingSpace_roomsLivingSpace"] span:nth-of-type(1) strong | trim',
    size: 'div[class*="HgListingRoomsLivingSpace_roomsLivingSpace"] span:nth-of-type(2) strong | trim',
    title: 'p[class*="HgListingDescription_title"] span | removeNewline | trim',
    address: 'div[class*="HgListingCard_address"] address | removeNewline | trim',
    description: 'p[class*="HgListingDescription_extra-large"] | removeNewline | trim',
    image: 'img[src*="media2.homegate.ch"]@src',
  },
  getListings,
  normalize,
  filter: applyBlacklist,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Homegate',
  baseUrl: 'https://www.homegate.ch/',
  id: 'homegate',
};
export { config, getListings };
