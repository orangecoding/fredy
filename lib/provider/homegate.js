/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import crypto from 'crypto';
import { buildHash, isOneOf } from '../utils.js';
import { extractNumber } from '../utils/extract-number.js';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];

// ─── Homegate mobile API (reverse-engineered from homegate-rs) ───────────────

const API_UA = 'homegate.ch App Android';
const API_APP_VERSION = 'Homegate/12.6.0/12060003/Android/30';
// SECRET = "ABuTZrcTGKN4AwjHed3Hj"
const API_SECRET = Buffer.from([
  65, 66, 117, 84, 90, 114, 99, 84, 71, 75, 78, 52, 65, 119, 106, 72, 101, 100, 51, 72, 106,
]);
const API_BASIC_AUTH = 'Basic ' + Buffer.from('hg_android:6VcGU6ceCFTk8dFm').toString('base64');
const API_ENDPOINT = 'https://api.homegate.ch/search/listings';
// Default search radius in metres around the geocoded city centre.
const DEFAULT_RADIUS_METRES = 10_000;

/**
 * Compute the HMAC-SHA256 X-App-Id header value required by the Homegate mobile API.
 * Algorithm: HMAC-SHA256(UA + AppVersion + ceil(unixSeconds/60)); read 4 bytes at
 * offset (last_byte & 0xF) as big-endian int32 and return as decimal string.
 * @returns {string}
 */
function calculateAppId() {
  const minuteBucket = Math.ceil(Date.now() / 1000 / 60);
  const input = `${API_UA}${API_APP_VERSION}${minuteBucket}`;
  const hmac = crypto.createHmac('sha256', API_SECRET).update(input).digest();
  const b = hmac[hmac.length - 1] & 0xf;
  return String(hmac.readInt32BE(b));
}

/**
 * Geocode a Swiss city or canton name to WGS-84 coordinates via Nominatim.
 * @param {string} cityName
 * @returns {Promise<{lat: number, lng: number}>}
 */
async function geocodeCity(cityName) {
  const params = new URLSearchParams({ q: cityName, countrycodes: 'ch', format: 'json', limit: '1' });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'fredy-homegate/1.0 (self-hosted real estate finder)' },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = await res.json();
  if (!data.length) throw new Error(`No geocoding result for "${cityName}"`);
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

/**
 * Parse a Homegate web URL to extract offer type, location, and filter params.
 * @param {string} webUrl
 * @returns {{ offerType: 'RENT'|'BUY', locationName: string|null, monthlyRent: object, numberOfRooms: object, livingSpace: object }}
 */
function parseUrlFilters(webUrl) {
  const u = new URL(webUrl);
  const params = u.searchParams;
  // Support de (/mieten/, /kaufen/), en (/rent/, /buy/), fr (/louer/, /acheter/), it (/affittare/)
  const offerType = /\/(rent|mieten|louer|affittare)\//i.test(u.pathname) ? 'RENT' : 'BUY';

  // Support de (ort-, kanton-), en (city-, canton-), fr (ville-, canton-), it (citta-, cantone-)
  const m = u.pathname.match(/\/(ort|city|ville|citta|kanton|canton|cantone)-([^/]+)\//);
  const locationName = m ? m[2].replace(/-/g, ' ') : null;

  const monthlyRent = {};
  if (params.has('ag')) monthlyRent.from = parseInt(params.get('ag'), 10);
  if (params.has('ah')) monthlyRent.to = parseInt(params.get('ah'), 10);

  const numberOfRooms = {};
  if (params.has('oi')) numberOfRooms.from = parseFloat(params.get('oi'));
  if (params.has('ob')) numberOfRooms.to = parseFloat(params.get('ob'));

  const livingSpace = {};
  if (params.has('al')) livingSpace.from = parseInt(params.get('al'), 10);
  if (params.has('am')) livingSpace.to = parseInt(params.get('am'), 10);

  return { offerType, locationName, monthlyRent, numberOfRooms, livingSpace };
}

/**
 * Build the Homegate search API request body.
 * @param {{ lat: number, lng: number, offerType: string, monthlyRent: object, numberOfRooms: object, livingSpace: object }} opts
 * @returns {object}
 */
function buildSearchBody({ lat, lng, offerType, monthlyRent, numberOfRooms, livingSpace }) {
  const query = {
    offerType,
    location: { latitude: lat, longitude: lng, radius: DEFAULT_RADIUS_METRES },
  };
  if (Object.keys(monthlyRent).length) query.monthlyRent = monthlyRent;
  if (Object.keys(numberOfRooms).length) query.numberOfRooms = numberOfRooms;
  if (Object.keys(livingSpace).length) query.livingSpace = livingSpace;

  return {
    from: 0,
    size: 20,
    sortBy: 'dateCreated',
    sortDirection: 'desc',
    trackTotalHits: false,
    query,
    resultTemplate: {},
  };
}

/**
 * Fetch listings from the Homegate mobile API (no browser required).
 *
 * This replaces the Puppeteer-based crawler for environments where a headless
 * Chromium fingerprint triggers the DataDome bot-detection challenge (e.g.
 * ARM64 Raspberry Pi even behind a residential proxy).
 *
 * The web search URL is parsed to extract the offer type, location (geocoded
 * via Nominatim), and optional filters (price range, rooms, living space).
 * Authentication uses Basic Auth + a time-based HMAC-SHA256 X-App-Id header.
 *
 * @param {string} url - The configured Homegate web search URL (may include
 *   the sortByDateParam appended by queryStringMutator — ignored here since
 *   sort is set directly in the API request body).
 * @returns {Promise<object[]>} Raw listing objects for the normalize() pipeline step.
 */
async function getListings(url) {
  const { offerType, locationName, monthlyRent, numberOfRooms, livingSpace } = parseUrlFilters(url);

  if (!locationName) {
    logger.warn('[Homegate] Could not parse location from URL — expected /ort-<city>/ or /kanton-<name>/ in path');
    return [];
  }

  logger.debug(`[Homegate] Geocoding "${locationName}" for mobile API search`);
  let coords;
  try {
    coords = await geocodeCity(locationName);
    logger.debug(`[Homegate] "${locationName}" → lat=${coords.lat} lng=${coords.lng}`);
  } catch (err) {
    logger.error(`[Homegate] Geocoding failed: ${err.message}`);
    return [];
  }

  const body = buildSearchBody({ ...coords, offerType, monthlyRent, numberOfRooms, livingSpace });
  logger.debug(`[Homegate] Mobile API body: ${JSON.stringify(body)}`);

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: API_BASIC_AUTH,
      'User-Agent': API_UA,
      'X-App-Version': API_APP_VERSION,
      'X-App-Id': calculateAppId(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`[Homegate] API error ${response.status}: ${text.slice(0, 400)}`);
    return [];
  }

  const data = await response.json();
  logger.debug(`[Homegate] API total=${data.total} returned=${data.results?.length ?? 0}`);

  const pathPrefix = offerType === 'BUY' ? 'kaufen' : 'mieten';

  return (data.results ?? []).map((result) => {
    const listing = result.listing ?? result;
    // Pick the best available localisation (de > fr > it > en)
    const loc =
      listing.localization?.de ??
      listing.localization?.fr ??
      listing.localization?.it ??
      listing.localization?.en ??
      {};
    const text = loc.text ?? {};
    const attachments = loc.attachments ?? [];
    const chars = listing.characteristics ?? {};
    const prices = listing.prices ?? {};
    const addr = listing.address ?? {};

    const addressStr = [addr.street, addr.zipCode, addr.city].filter(Boolean).join(', ') || null;
    const rentAmount = prices.rent?.gross ?? prices.buy?.price ?? null;
    const priceStr = rentAmount != null ? `CHF ${rentAmount}` : null;
    const imgAttachment = attachments.find((a) => a.type === 'IMAGE');
    const image = imgAttachment?.url ?? null;
    const listingId = listing.id ?? result.id;

    return {
      id: `https://www.homegate.ch/${pathPrefix}/${listingId}`,
      link: `https://www.homegate.ch/${pathPrefix}/${listingId}`,
      title: text.title ?? null,
      description: text.description ?? null,
      price: priceStr,
      rooms: chars.numberOfRooms ?? null,
      size: chars.livingSpace != null ? `${chars.livingSpace}` : null,
      address: addressStr,
      image,
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
