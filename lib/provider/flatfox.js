/*
 * Flatfox.ch provider for Fredy
 * Swiss real estate platform owned by SMG (free for landlords)
 *
 * Uses Flatfox public API instead of HTML scraping for reliability.
 */

import { buildHash, isOneOf } from '../utils.js';

let appliedBlackList = [];

/**
 * Extract search parameters from user-provided URL.
 * Example URL: https://www.flatfox.ch/en/search/?east=7.533549&north=47.024424&object_category=APARTMENT&offer_type=RENT&south=46.909588&west=7.318974
 */
function parseSearchUrl(url) {
  const urlObj = new URL(url);
  const params = {};

  // Extract all search parameters
  for (const [key, value] of urlObj.searchParams) {
    params[key] = value;
  }

  return params;
}

/**
 * Fetch listing IDs from the pin API (map markers).
 */
async function fetchListingIds(params) {
  const apiUrl = new URL('https://flatfox.ch/api/v1/pin/');

  // Required geo params
  if (params.east) apiUrl.searchParams.set('east', params.east);
  if (params.west) apiUrl.searchParams.set('west', params.west);
  if (params.north) apiUrl.searchParams.set('north', params.north);
  if (params.south) apiUrl.searchParams.set('south', params.south);

  // Filter params
  if (params.object_category) apiUrl.searchParams.set('object_category', params.object_category);
  if (params.offer_type) apiUrl.searchParams.set('offer_type', params.offer_type);
  if (params.rooms_from) apiUrl.searchParams.set('rooms_from', params.rooms_from);
  if (params.rooms_to) apiUrl.searchParams.set('rooms_to', params.rooms_to);
  if (params.price_from) apiUrl.searchParams.set('price_from', params.price_from);
  if (params.price_to) apiUrl.searchParams.set('price_to', params.price_to);

  // Limit results
  apiUrl.searchParams.set('max_count', '100');

  const response = await fetch(apiUrl.toString());
  if (!response.ok) {
    throw new Error(`Flatfox pin API error: ${response.status}`);
  }

  const pins = await response.json();
  return pins.map((pin) => pin.pk);
}

/**
 * Fetch full listing details from the public-listing API.
 */
async function fetchListingDetails(pks) {
  if (pks.length === 0) return [];

  const apiUrl = new URL('https://flatfox.ch/api/v1/public-listing/');
  apiUrl.searchParams.set('expand', 'cover_image');
  apiUrl.searchParams.set('limit', '0'); // No pagination limit

  // Add all PKs as query params
  pks.forEach((pk) => apiUrl.searchParams.append('pk', pk));

  const response = await fetch(apiUrl.toString());
  if (!response.ok) {
    throw new Error(`Flatfox public-listing API error: ${response.status}`);
  }

  const data = await response.json();

  // API returns array directly, not wrapped in {results: [...]}
  if (Array.isArray(data)) {
    return data;
  }

  // Fallback for paginated response format
  return data.results || [];
}

/**
 * Map API response to Fredy listing format.
 */
function mapApiToListing(item) {
  const pk = String(item.pk);
  const price = item.price_display ? `${item.price_display.toLocaleString('de-CH')} CHF` : '';

  // Build rooms/size string
  const rooms = item.number_of_rooms || '';
  const livingSpace = item.surface_living ? `${item.surface_living} m²` : '';
  const size = [rooms ? `${rooms} rooms` : '', livingSpace].filter(Boolean).join(', ');

  // Build image URL
  let image = '';
  if (item.cover_image?.url_listing_search) {
    image = `https://flatfox.ch${item.cover_image.url_listing_search}`;
  }

  return {
    id: pk,
    price: price,
    size: size,
    title: item.short_title || item.pitch_title || '',
    link: `https://www.flatfox.ch${item.url}`,
    description: item.description_title || item.description?.substring(0, 200) || '',
    address: item.public_address || '',
    image: image,
  };
}

/**
 * Custom getListings function that uses Flatfox API.
 * This replaces the default HTML scraper.
 */
async function getListings(url) {
  try {
    // Parse the user's search URL
    const params = parseSearchUrl(url);

    // Fetch listing IDs from pin API
    const pks = await fetchListingIds(params);

    if (pks.length === 0) {
      return [];
    }

    // Fetch full details for each listing
    const listings = await fetchListingDetails(pks);

    // Map to Fredy format
    return listings.map(mapApiToListing);
  } catch (error) {
    console.error('Flatfox API error:', error);
    return [];
  }
}

function normalize(o) {
  // ID is already the pk from API, create hash with price for dedup
  const id = buildHash(o.id, o.price);
  return Object.assign(o, { id });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return o.title != null && titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  url: null,
  // These are not used when getListings is provided, but kept for compatibility
  crawlContainer: null,
  sortByDateParam: null,
  waitForSelector: null,
  crawlFields: {
    id: '',
    price: '',
    size: '',
    title: '',
    link: '',
    description: '',
    address: '',
    image: '',
  },
  normalize: normalize,
  filter: applyBlacklist,
  getListings: getListings,
};

export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};

export const metaInformation = {
  name: 'Flatfox',
  baseUrl: 'https://www.flatfox.ch/',
  id: 'flatfox',
};

export { config };
