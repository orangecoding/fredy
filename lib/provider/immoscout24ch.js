/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * ImmoScout24 Switzerland provider using the mobile API.
 *
 * Two-step API flow (no browser / DataDome required):
 *   1. POST https://api.immoscout24.ch/search/listings
 *      Body: { query: { offerType, location: { geoTags }, propertyType }, from, size, ... }
 *      Returns listing IDs in `results[].id`.
 *
 *   2. GET https://api.immoscout24.ch/listings/listings?ids={comma-separated}&fieldset=srp-list
 *      Returns full listing detail including images, price, address, description.
 *
 * Headers reverse-engineered from the Android app (v6.1.9):
 *   user-agent:     immoscout24.ch.nextgen App Android/6.1.9
 *   x-app-version:  Immoscout24/6.1.9(6100901)/Android/35
 *   x-app-time:     {unix_ms_timestamp}{random_hex_suffix}
 *
 * The listing data structure is shared with Homegate (same parent company, Swiss
 * Marketplace Group). A listing's `platforms` array lists all portals where it
 * appears (homegate, immoscout24, flatfox, alleimmobilien, …).
 *
 * URL format accepted by this provider (paste your immoscout24.ch search URL):
 *   https://www.immoscout24.ch/de/immobilien/mieten/ort-lausanne
 *   https://www.immoscout24.ch/fr/immobilier/louer/lieu-lausanne
 *   https://www.immoscout24.ch/de/immobilien/kaufen/ort-zurich
 */

import { randomBytes } from 'crypto';
import { buildHash, isOneOf } from '../utils.js';
import { extractNumber } from '../utils/extract-number.js';
import logger from '../services/logger.js';
import { getSettings, upsertSettings } from '../services/storage/settingsStorage.js';

/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];

const API_BASE = 'https://api.immoscout24.ch';
const APP_VERSION = '6.1.9';
const APP_BUILD = '6100901';

/**
 * @param {string} [datadoomeCookie]
 * @returns {Record<string, string>}
 */
function makeHeaders(datadoomeCookie) {
  const headers = {
    'user-agent': `immoscout24.ch.nextgen App Android/${APP_VERSION}`,
    'x-app-version': `Immoscout24/${APP_VERSION}(${APP_BUILD})/Android/35`,
    'x-app-id': '',
    'x-app-time': `${Date.now()}${randomBytes(6).toString('hex').slice(0, 11)}`,
    'accept-encoding': 'gzip',
  };
  if (datadoomeCookie) headers.cookie = `datadome=${datadoomeCookie}`;
  return headers;
}

/**
 * Translate the path segment used in immoscout24.ch search URLs to a geoTag
 * accepted by the API (e.g. `ort-lausanne` → `geo-city-lausanne`).
 *
 * Supported prefixes (all languages):
 *   ort-    / lieu-   / luogo-  / city-     → geo-city-{slug}
 *   kanton- / canton- / cantone- / canton-   → geo-canton-{slug}
 *   region- / région- / regione-             → geo-region-{slug}
 *
 * @param {string} locationSegment
 * @returns {string | null}
 */
function locationToGeoTag(locationSegment) {
  if (!locationSegment) return null;
  const cityPrefixes = ['ort-', 'lieu-', 'luogo-', 'city-'];
  const cantonPrefixes = ['kanton-', 'canton-', 'cantone-'];
  const regionPrefixes = ['region-', 'région-', 'regione-'];

  for (const p of cityPrefixes) {
    if (locationSegment.startsWith(p)) return `geo-city-${locationSegment.slice(p.length)}`;
  }
  for (const p of cantonPrefixes) {
    if (locationSegment.startsWith(p)) return `geo-canton-${locationSegment.slice(p.length)}`;
  }
  for (const p of regionPrefixes) {
    if (locationSegment.startsWith(p)) return `geo-region-${locationSegment.slice(p.length)}`;
  }
  // Fall back: assume it is already a geoTag or an unknown format
  return locationSegment.startsWith('geo-') ? locationSegment : null;
}

/**
 * Parse the Fredy job URL (an immoscout24.ch search URL) into API parameters.
 *
 * @param {string} url
 * @returns {{ offerType: 'RENT'|'BUY', geoTag: string|null }}
 */
function parseJobUrl(url) {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return { offerType: 'RENT', geoTag: null };
  }
  // e.g. /de/immobilien/mieten/ort-lausanne  or  /fr/immobilier/louer/lieu-lausanne
  const parts = pathname.split('/').filter(Boolean);
  const offerSegment = parts[2] ?? '';
  const locationSegment = parts[3] ?? '';

  const rentKeywords = ['mieten', 'louer', 'affittare', 'rent'];
  const offerType = rentKeywords.includes(offerSegment.toLowerCase()) ? 'RENT' : 'BUY';
  const geoTag = locationToGeoTag(locationSegment);

  return { offerType, geoTag };
}

/**
 * Fetch listings from the ImmoScout24 CH mobile API.
 *
 * @param {string} url - The configured immoscout24.ch search URL.
 * @returns {Promise<object[]>} Raw listing objects (as returned by the /listings endpoint).
 */
async function getListings(url) {
  const { offerType, geoTag } = parseJobUrl(url);

  if (!geoTag) {
    logger.warn(
      `[ImmoScout24CH] Could not derive a geoTag from URL: ${url}. ` +
        'URL must contain a location segment like ort-lausanne or lieu-lausanne.',
    );
    return [];
  }

  logger.debug(`[ImmoScout24CH] Searching: offerType=${offerType}, geoTag=${geoTag}`);

  const settings = await getSettings();
  const datadoomeCookie = typeof settings?.immoscout24ch_datadome === 'string'
    ? settings.immoscout24ch_datadome.trim()
    : '';
  if (!datadoomeCookie) {
    logger.warn('[ImmoScout24CH] No DataDome cookie configured — requests may return 403. ' +
      'Set immoscout24ch_datadome in Settings → Execution.');
  }
  const headers = makeHeaders(datadoomeCookie || undefined);

  // Step 1 — search for listing IDs
  const searchBody = {
    query: {
      offerType,
      location: { geoTags: [geoTag] },
      propertyType: 'APARTMENT_OR_HOUSE',
    },
    sortBy: 'listingType',
    sortDirection: 'desc',
    from: 0,
    size: 20,
    trackTotalHits: true,
    fieldset: 'srp-list',
  };

  let ids;
  try {
    let res = await fetch(`${API_BASE}/search/listings`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(searchBody),
    });

    // DataDome returns 403 with a Set-Cookie header containing a fresh datadome token.
    // Retrying immediately with that cookie is often enough to pass the challenge without
    // human CAPTCHA interaction (the mobile SDK does the same thing automatically).
    if (res.status === 403) {
      const setCookie = res.headers.get('set-cookie') ?? '';
      const freshCookie = setCookie.match(/datadome=([^;]+)/)?.[1];
      if (freshCookie) {
        logger.debug('[ImmoScout24CH] Got 403 — retrying with fresh DataDome cookie from response');
        res = await fetch(`${API_BASE}/search/listings`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json; charset=utf-8', cookie: `datadome=${freshCookie}` },
          body: JSON.stringify(searchBody),
        });
        if (res.ok) {
          upsertSettings({ immoscout24ch_datadome: freshCookie });
        }
      }
    }

    if (!res.ok) {
      if (res.status === 403) {
        logger.error(
          '[ImmoScout24CH] Search failed: HTTP 403 — DataDome requires human CAPTCHA verification. ' +
            'Open the ImmoScout24 CH Android app via Charles Proxy, solve the CAPTCHA once, ' +
            'and paste the datadome cookie value into Settings → Execution → ImmoScout24 CH DataDome Cookie.',
        );
      } else {
        logger.error(`[ImmoScout24CH] Search failed: HTTP ${res.status}`);
      }
      return [];
    }
    const data = await res.json();
    ids = (data.results ?? []).map((r) => r.id).filter(Boolean);
    logger.debug(`[ImmoScout24CH] Got ${ids.length} listing IDs (total available: ${data.total})`);
  } catch (err) {
    logger.error(`[ImmoScout24CH] Search request failed: ${err.message}`);
    return [];
  }

  if (ids.length === 0) return [];

  // Step 2 — fetch full listing details
  try {
    const res = await fetch(
      `${API_BASE}/listings/listings?ids=${ids.join('%2C')}&fieldset=srp-list`,
      { headers },
    );
    if (!res.ok) {
      logger.error(`[ImmoScout24CH] Listings fetch failed: HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const listings = data.listings ?? [];
    logger.debug(`[ImmoScout24CH] Fetched details for ${listings.length} listings`);
    return listings;
  } catch (err) {
    logger.error(`[ImmoScout24CH] Listings request failed: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {any} o - Raw listing object from the /listings API response.
 * @returns {ParsedListing}
 */
function normalize(o) {
  const listing = o.listing ?? o;
  const offerType = listing.offerType ?? 'RENT';
  const pathPrefix = offerType === 'BUY' ? 'kaufen' : 'mieten';
  const listingId = listing.id ?? o.id;

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

  const link = `https://www.immoscout24.ch/${pathPrefix}/${listingId}`;
  const id = buildHash(String(listingId));
  const addressStr = [addr.street, addr.postalCode, addr.locality].filter(Boolean).join(', ') || null;
  const rentAmount = prices.rent?.gross ?? prices.buy?.price ?? null;
  const price = rentAmount != null ? rentAmount : null;
  const imgAttachment = attachments.find((a) => a.type === 'IMAGE');

  return {
    id,
    link,
    title: text.title ?? null,
    price,
    currency: 'CHF',
    size: chars.livingSpace != null ? chars.livingSpace : null,
    rooms: chars.numberOfRooms != null ? chars.numberOfRooms : null,
    address: addressStr,
    image: imgAttachment?.url ?? null,
    description: text.description ?? null,
  };
}

/**
 * @param {ParsedListing} o
 * @returns {boolean}
 */
function applyBlacklist(o) {
  return !isOneOf(o.title, appliedBlackList) && !isOneOf(o.description, appliedBlackList);
}

/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'description'],
  url: null,
  sortByDateParam: null,
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
  name: 'ImmoScout24 CH',
  baseUrl: 'https://www.immoscout24.ch/',
  id: 'immoscout24ch',
};

export { config, getListings };
