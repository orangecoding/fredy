/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import { extractNumber } from '../utils/extract-number.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];

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
  crawlContainer: 'div[data-test="result-list-item"]',
  sortByDateParam: 'sortBy=dateCreated,desc',
  // waitForSelector targets the listing container which only exists on the real page —
  // naturally waits out the DataDome JS challenge (~4-6s) without relying on network-idle
  // timing which fires too early on the challenge page.
  waitForSelector: 'div[data-test="result-list"]',
  puppeteerOptions: {
    puppeteerTimeout: 120_000,
    puppeteerSelectorTimeout: 90_000,
    preNavigateUrl: 'https://www.homegate.ch/',
    // DataDome returns HTTP 403 for the initial response but the client-side JS challenge
    // still runs and CloakBrowser passes it, loading real content. We skip the 403 status
    // check here; waitForSelector already rejects bot/captcha pages (no listing element).
    ignoredStatusCodes: [403],
    // Homegate renders only the listings visible in the viewport on initial load.
    // Scrolling to the bottom triggers the React virtual list to mount all cards.
    autoScroll: true,
    autoScrollDelay: 600,
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
  normalize: normalize,
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
export { config };
