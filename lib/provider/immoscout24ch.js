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
 * This provider extracts listings from window.__INITIAL_STATE__ which contains
 * the full listing data as JSON. This is more reliable than HTML scraping.
 *
 * Uses Bright Data Web Unlocker to bypass DataDome bot protection.
 * The Web Unlocker handles JavaScript rendering and captcha solving internally.
 */

import { buildHash, isOneOf, nullOrEmpty } from '../utils.js';
import logger from '../services/logger.js';

const BRIGHT_DATA_API_URL = 'https://api.brightdata.com/request';

let appliedBlackList = [];

/**
 * Extract __INITIAL_STATE__ from HTML string.
 * @param {string} html - Raw HTML content
 * @returns {Object|null} Parsed initial state or null
 */
function extractInitialStateFromHtml(html) {
  try {
    // Match __INITIAL_STATE__ with optional semicolon before closing script tag
    const match = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
    if (!match) {
      logger.warn('ImmoScout24.ch: Could not find __INITIAL_STATE__ in HTML');
      return null;
    }
    return JSON.parse(match[1]);
  } catch (err) {
    logger.error('ImmoScout24.ch: Error parsing __INITIAL_STATE__:', err.message);
    return null;
  }
}

/**
 * Extract listings from __INITIAL_STATE__ JSON.
 * Path: window.__INITIAL_STATE__.resultList.search.fullSearch.result.listings
 */
function extractListingsFromState(initialState) {
  const listings = initialState?.resultList?.search?.fullSearch?.result?.listings;
  if (!Array.isArray(listings)) {
    logger.warn('ImmoScout24.ch: No listings array found in __INITIAL_STATE__');
    return [];
  }
  return listings;
}

/**
 * Map property categories to URL-friendly slugs.
 * Categories from __INITIAL_STATE__ like ["APARTMENT", "FLAT"] map to URL segments.
 */
const PROPERTY_TYPE_MAP = {
  APARTMENT: 'flat',
  FLAT: 'flat',
  HOUSE: 'house',
  VILLA: 'house',
  CHALET: 'house',
  FARMHOUSE: 'house',
  STUDIO: 'flat',
  LOFT: 'flat',
  ATTIC: 'flat',
  DUPLEX: 'flat',
  PARKING: 'parking',
  GARAGE: 'parking',
  COMMERCIAL: 'commercial',
  OFFICE: 'commercial',
  RETAIL: 'commercial',
  INDUSTRIAL: 'commercial',
  GASTRONOMY: 'commercial',
  PLOT: 'plot',
  LAND: 'plot',
};

/**
 * Get URL-friendly property type from categories array.
 * @param {string[]} categories - Array of category strings from listing
 * @returns {string} URL slug for property type
 */
export function getPropertyTypeSlug(categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    return 'property';
  }
  for (const cat of categories) {
    const slug = PROPERTY_TYPE_MAP[cat?.toUpperCase()];
    if (slug) return slug;
  }
  return 'property';
}

/**
 * Sanitize locality string for use in URLs.
 * Handles special characters, spaces, and umlauts.
 * @param {string} locality - Raw locality string (e.g., "Zürich HB", "St. Gallen")
 * @returns {string} URL-safe locality slug
 */
export function sanitizeLocality(locality) {
  if (!locality || typeof locality !== 'string') {
    return 'switzerland';
  }
  return (
    locality
      .toLowerCase()
      // Replace German umlauts
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      // Replace French accents
      .replace(/[éèêë]/g, 'e')
      .replace(/[àâä]/g, 'a')
      .replace(/[ùûü]/g, 'u')
      .replace(/[îï]/g, 'i')
      .replace(/[ôö]/g, 'o')
      .replace(/ç/g, 'c')
      // Replace any non-alphanumeric chars with dashes
      .replace(/[^a-z0-9]+/g, '-')
      // Remove leading/trailing dashes
      .replace(/^-+|-+$/g, '') || 'switzerland'
  );
}

/**
 * Build price string from listing prices object.
 */
function buildPriceString(prices) {
  if (prices.rent?.gross) {
    const suffix = prices.rent.interval === 'MONTH' ? '/month' : '';
    return `CHF ${prices.rent.gross}${suffix}`;
  }
  if (prices.buy?.price) {
    return `CHF ${prices.buy.price}`;
  }
  return '';
}

/**
 * Build size string from listing characteristics.
 */
function buildSizeString(characteristics) {
  const parts = [];
  if (characteristics.numberOfRooms) {
    parts.push(`${characteristics.numberOfRooms} rooms`);
  }
  if (characteristics.livingSpace) {
    parts.push(`${characteristics.livingSpace} m²`);
  }
  return parts.join(', ');
}

/**
 * Build address string from listing address object.
 */
function buildAddressString(address) {
  const parts = [];
  if (address.street) {
    parts.push(address.street);
  }
  if (address.postalCode || address.locality) {
    parts.push([address.postalCode, address.locality].filter(Boolean).join(' '));
  }
  return parts.join(', ');
}

/**
 * Transform a listing from __INITIAL_STATE__ format to Fredy format.
 */
function transformListing(item) {
  const listing = item.listing || {};
  const localization = listing.localization || {};
  const primaryLang = localization.primary || 'de';
  const localizedData = localization[primaryLang] || localization.de || {};
  const text = localizedData.text || {};
  const characteristics = listing.characteristics || {};
  const prices = listing.prices || {};
  const address = listing.address || {};
  const attachments = localizedData.attachments || [];

  const listingId = listing.id || item.id;
  const offerType = listing.offerType === 'BUY' ? 'buy' : 'rent';
  const imageAttachment = attachments.find((a) => a.type === 'IMAGE');

  return {
    id: listingId,
    title: text.title || '',
    description: text.description || '',
    price: buildPriceString(prices),
    size: buildSizeString(characteristics),
    address: buildAddressString(address),
    link: `https://www.immoscout24.ch/${offerType}/${listingId}`,
    image: imageAttachment?.url || '',
  };
}

/**
 * Normalize a listing object (called by pipeline after getListings).
 */
function normalize(o) {
  const id = buildHash(o.id, o.price);
  const title = nullOrEmpty(o.title) ? 'NO TITLE FOUND' : o.title.trim();
  const address = nullOrEmpty(o.address) ? 'NO ADDRESS FOUND' : o.address.trim();

  return Object.assign(o, { id, title, address });
}

/**
 * Apply blacklist filter.
 */
function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

/**
 * Fetch listings using Bright Data Web Unlocker.
 * Called with `this` bound to FredyPipelineExecutioner.
 *
 * @param {string} url The URL to fetch listings from
 * @returns {Promise<Array>} Array of listing objects
 */
async function getListings(url) {
  const globalSettings = this._globalSettings || {};
  const apiToken = globalSettings.brightDataApiToken;
  const zone = globalSettings.brightDataZone;

  if (!apiToken || !zone) {
    logger.warn('ImmoScout24.ch: Bright Data API token or zone not configured. Please add them in Settings.');
    return [];
  }

  try {
    logger.debug(`ImmoScout24.ch: Fetching listings via Bright Data from ${url}`);

    // Make request to Bright Data Web Unlocker
    const response = await fetch(BRIGHT_DATA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        zone: zone,
        url: url,
        format: 'raw',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`ImmoScout24.ch: Bright Data API error (${response.status}): ${errorText}`);
      return [];
    }

    // With format: 'raw', Bright Data returns the HTML directly
    const html = await response.text();

    logger.debug(`ImmoScout24.ch: Received ${html.length} bytes from Bright Data`);

    // Extract __INITIAL_STATE__ from HTML
    const initialState = extractInitialStateFromHtml(html);
    if (!initialState) {
      logger.warn('ImmoScout24.ch: Could not extract __INITIAL_STATE__ from response');
      return [];
    }

    // Extract and transform listings
    const rawListings = extractListingsFromState(initialState);
    logger.info(`ImmoScout24.ch: Found ${rawListings.length} listings`);

    return rawListings.map(transformListing);
  } catch (error) {
    logger.error('ImmoScout24.ch: Error fetching listings:', error);
    return [];
  }
}

const config = {
  url: null,
  // These are kept for compatibility but not used when getListings is defined
  crawlContainer: '[data-test^="result-list-item"]',
  sortByDateParam: 'sorting=dateCreated-desc',
  waitForSelector: null,
  proxyRequired: false, // Bright Data handles everything internally
  crawlFields: {
    id: 'id',
    price: 'price',
    size: 'size',
    title: 'title',
    link: 'link',
    description: 'description',
    address: 'address',
    image: 'image',
  },
  // Custom extraction using Bright Data Web Unlocker
  getListings: getListings,
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
