/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * ImmoScout24.ch provider for Fredy
 *
 * IMPORTANT: ImmoScout24.ch (SMG Swiss Marketplace Group) is a completely
 * separate company from ImmoScout24.de (Scout24 SE). They share no code,
 * APIs, or infrastructure.
 *
 * This provider uses HTML scraping via Puppeteer. Note that ImmoScout24.ch
 * uses DataDome bot protection which may block automated requests in some
 * environments (especially headless browsers in CI).
 */

import { buildHash, isOneOf, nullOrEmpty } from '../utils.js';

let appliedBlackList = [];

/**
 * Extract listing ID from URL.
 * URL format: /rent/4002086117 or /en/d/rent/4002086117
 */
function extractListingId(url) {
  if (!url) return null;
  const match = url.match(/\/(?:rent|buy|d\/rent|d\/buy)\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Normalize a listing object.
 */
function normalize(o) {
  // Extract ID from link
  const listingId = extractListingId(o.id) || extractListingId(o.link) || o.id;
  const id = buildHash(listingId, o.price);

  // Clean up title
  const title = nullOrEmpty(o.title) ? 'NO TITLE FOUND' : o.title.trim();

  // Clean up address
  const address = nullOrEmpty(o.address) ? 'NO ADDRESS FOUND' : o.address.trim();

  // Build full link if needed
  let link = o.link || o.id;
  if (link && !link.startsWith('http')) {
    link = `${metaInformation.baseUrl}${link.replace(/^\//, '')}`;
  }

  return Object.assign(o, { id, title, address, link });
}

/**
 * Apply blacklist filter.
 */
function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  url: null,
  // Listing card container - matches all card sizes (XL, L, M)
  crawlContainer: '[data-test^="result-list-item"]',
  // Sort by newest listings
  sortByDateParam: 'sort=dateCreated,desc',
  // Wait for search results to load
  waitForSelector: '[data-test="result-list"]',
  // ImmoScout24.ch uses DataDome bot protection - requires residential proxy
  proxyRequired: true,
  crawlFields: {
    // Link contains the listing ID (e.g., /en/d/rent/4002086117)
    id: 'a[class*="HgCardElevated_link"]@href',
    // Combined rooms, size, and price info
    price: '[class*="HgListingRoomsLivingSpacePrice"] | removeNewline | trim',
    // Size is part of the combined field
    size: '[class*="HgListingRoomsLivingSpacePrice"] | removeNewline | trim',
    // Listing title
    title: '[class*="HgListingDescription_title"] | removeNewline | trim',
    // Link to the listing detail page
    link: 'a[class*="HgCardElevated_link"]@href',
    // Description text
    description: '[class*="HgListingDescription_description"] | removeNewline | trim',
    // Address
    address: '[class*="HgListingCard_address"] | removeNewline | trim',
    // Image from CDN
    image: 'img[src*="cdn.immoscout24.ch"]@src',
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
  name: 'ImmoScout24.ch',
  baseUrl: 'https://www.immoscout24.ch/',
  id: 'immoscout24ch',
};

export { config };
