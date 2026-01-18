/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Newhome.ch provider for Fredy
 *
 * Newhome.ch is owned by Swiss Kantonalbanken and AXA. Often has exclusive
 * listings from cantonal banks that don't appear on SMG platforms (Homegate,
 * ImmoScout24.ch, Flatfox).
 *
 * Uses Bright Data Web Unlocker to bypass Cloudflare Turnstile protection.
 *
 * Extraction strategy:
 * 1. Try __NEXT_DATA__ extraction (Next.js SSR)
 * 2. Fall back to HTML parsing if needed
 */

import { buildHash, isOneOf, nullOrEmpty } from '../utils.js';
import logger from '../services/logger.js';

const BRIGHT_DATA_API_URL = 'https://api.brightdata.com/request';
const BRIGHT_DATA_TIMEOUT_MS = 120_000; // 120 seconds

let appliedBlackList = [];

/**
 * Extract __NEXT_DATA__ from HTML string.
 * Newhome.ch uses Next.js, so data is in this script tag.
 * @param {string} html - Raw HTML content
 * @returns {Object|null} Parsed JSON data or null
 */
function extractNextData(html) {
  try {
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
    if (!match) {
      return null;
    }
    return JSON.parse(match[1]);
  } catch (err) {
    logger.debug('Newhome: Error parsing __NEXT_DATA__:', err.message);
    return null;
  }
}

/**
 * Extract listings from __NEXT_DATA__ structure.
 * Path varies by page structure, we try common paths.
 * @param {Object} nextData - Parsed __NEXT_DATA__ object
 * @returns {Array} Array of listing objects
 */
function extractListingsFromNextData(nextData) {
  const props = nextData?.props?.pageProps;
  if (!props) {
    return [];
  }

  // Try common data paths for Next.js real estate sites
  const possiblePaths = [
    props.listings,
    props.properties,
    props.results,
    props.data?.listings,
    props.data?.properties,
    props.data?.results,
    props.initialData?.listings,
    props.dehydratedState?.queries?.[0]?.state?.data?.listings,
    props.dehydratedState?.queries?.[0]?.state?.data?.results,
  ];

  for (const data of possiblePaths) {
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    // Handle paginated response with edges/nodes pattern
    if (data?.edges && Array.isArray(data.edges)) {
      return data.edges.map((e) => e.node).filter(Boolean);
    }
  }

  return [];
}

/**
 * Try to detect the listing ID from various possible fields.
 */
function extractId(item) {
  return item.id || item.pk || item.listingId || item.propertyId || item.objectId || '';
}

/**
 * Extract title from listing.
 */
function extractTitle(item) {
  return item.title || item.name || item.headline || item.shortTitle || '';
}

/**
 * Extract price from listing, format as string.
 */
function extractPrice(item) {
  // Try common price field patterns
  const price = item.price || item.rent || item.rentPrice || item.grossRent || item.netRent;

  if (typeof price === 'number') {
    return `CHF ${price.toLocaleString('de-CH')}`;
  }

  if (typeof price === 'object' && price !== null) {
    const amount = price.amount || price.value || price.gross || price.net;
    if (amount) {
      const currency = price.currency || 'CHF';
      return `${currency} ${Number(amount).toLocaleString('de-CH')}`;
    }
  }

  if (item.formattedPrice) {
    return item.formattedPrice;
  }

  if (item.priceFormatted || item.priceDisplay) {
    return item.priceFormatted || item.priceDisplay;
  }

  return '';
}

/**
 * Extract size/rooms info from listing.
 */
function extractSize(item) {
  const parts = [];

  const rooms = item.rooms || item.numberOfRooms || item.roomCount || item.characteristics?.numberOfRooms;
  if (rooms) {
    parts.push(`${rooms} rooms`);
  }

  const area = item.area || item.livingSpace || item.surfaceLiving || item.size || item.characteristics?.livingSpace;
  if (area) {
    parts.push(`${area} m²`);
  }

  return parts.join(', ');
}

/**
 * Extract address from listing.
 */
function extractAddress(item) {
  // Direct address string
  if (typeof item.address === 'string') {
    return item.address;
  }

  // Address object
  const addr = item.address || item.location || {};
  const parts = [];

  if (addr.street) parts.push(addr.street);
  if (addr.streetNumber) parts[parts.length - 1] += ` ${addr.streetNumber}`;

  const cityParts = [];
  if (addr.postalCode || addr.zip || addr.postcode) {
    cityParts.push(addr.postalCode || addr.zip || addr.postcode);
  }
  if (addr.locality || addr.city || addr.place || addr.locationName) {
    cityParts.push(addr.locality || addr.city || addr.place || addr.locationName);
  }
  if (cityParts.length) {
    parts.push(cityParts.join(' '));
  }

  return parts.join(', ');
}

/**
 * Extract image URL from listing.
 */
function extractImage(item) {
  // Direct image URL
  if (typeof item.image === 'string') {
    return item.image;
  }

  // Image object
  if (item.image?.url) return item.image.url;
  if (item.mainImage?.url) return item.mainImage.url;
  if (item.thumbnail?.url) return item.thumbnail.url;
  if (item.coverImage?.url) return item.coverImage.url;

  // Images array
  if (Array.isArray(item.images) && item.images.length > 0) {
    const first = item.images[0];
    return typeof first === 'string' ? first : first?.url || '';
  }

  // Attachments array
  if (Array.isArray(item.attachments) && item.attachments.length > 0) {
    const img = item.attachments.find((a) => a.type === 'IMAGE' || a.type === 'image');
    return img?.url || '';
  }

  return '';
}

/**
 * Build detail page URL for a listing.
 * @param {Object} item - Listing data
 * @param {string} offerType - 'rent' or 'buy'
 * @returns {string} Full URL to listing detail page
 */
function buildListingUrl(item, offerType = 'rent') {
  const id = extractId(item);
  if (!id) {
    return 'https://www.newhome.ch';
  }

  // If listing has a direct URL, use it
  if (item.url && typeof item.url === 'string') {
    if (item.url.startsWith('http')) {
      return item.url;
    }
    return `https://www.newhome.ch${item.url.startsWith('/') ? '' : '/'}${item.url}`;
  }

  // Build URL from ID
  return `https://www.newhome.ch/en/${offerType}/property/${id}`;
}

/**
 * Determine offer type (rent/buy) from listing.
 */
function getOfferType(item) {
  const type = item.offerType || item.transactionType || item.type || '';
  const typeLower = String(type).toLowerCase();

  if (typeLower.includes('buy') || typeLower.includes('sale') || typeLower.includes('purchase')) {
    return 'buy';
  }
  return 'rent';
}

/**
 * Transform a listing from Newhome.ch format to Fredy format.
 */
function transformListing(item) {
  const offerType = getOfferType(item);

  return {
    id: extractId(item),
    title: extractTitle(item),
    description: item.description || item.body || item.text || '',
    price: extractPrice(item),
    size: extractSize(item),
    address: extractAddress(item),
    link: buildListingUrl(item, offerType),
    image: extractImage(item),
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
    logger.warn('Newhome: Bright Data API token or zone not configured. Please add them in Settings.');
    return [];
  }

  try {
    logger.debug(`Newhome: Fetching listings via Bright Data from ${url}`);

    // Set up timeout for Bright Data API call
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BRIGHT_DATA_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(BRIGHT_DATA_API_URL, {
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
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Newhome: Bright Data API error (${response.status}): ${errorText}`);
      return [];
    }

    const html = await response.text();
    logger.debug(`Newhome: Received ${html.length} bytes from Bright Data`);

    // Try __NEXT_DATA__ extraction (Next.js)
    const nextData = extractNextData(html);
    if (nextData) {
      const listings = extractListingsFromNextData(nextData);
      if (listings.length > 0) {
        logger.info(`Newhome: Extracted ${listings.length} listings from __NEXT_DATA__`);
        return listings.map(transformListing);
      }
      logger.debug('Newhome: __NEXT_DATA__ found but no listings extracted');
    }

    // Log a sample of HTML for debugging if no listings found
    logger.warn('Newhome: Could not extract listings. HTML sample:', html.substring(0, 500).replace(/\s+/g, ' '));
    return [];
  } catch (error) {
    if (error.name === 'AbortError') {
      logger.error(`Newhome: Request timed out after ${BRIGHT_DATA_TIMEOUT_MS / 1000}s`);
    } else {
      logger.error('Newhome: Error fetching listings:', error);
    }
    return [];
  }
}

const config = {
  url: null,
  crawlContainer: null,
  sortByDateParam: null,
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
  getListings: getListings,
  normalize: normalize,
  filter: applyBlacklist,
};

export function init(sourceConfig, blacklist) {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
}

export const metaInformation = {
  name: 'Newhome',
  baseUrl: 'https://www.newhome.ch/',
  id: 'newhome',
};

export { config };
