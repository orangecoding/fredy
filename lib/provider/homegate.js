/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import { extractNumber } from '../utils/extract-number.js';
import logger from '../services/logger.js';
import { getSettings } from '../services/storage/settingsStorage.js';
import { launchBrowser, closeBrowser } from '../services/extractor/puppeteerExtractor.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];

/**
 * Fetch listings using CloakBrowser, reading window.__INITIAL_STATE__ at
 * DOMContentLoaded before DataDome's deferred scripts run their challenge.
 *
 * __INITIAL_STATE__ is set by an inline synchronous script during HTML parsing
 * and is therefore available at domcontentloaded. DataDome on Homegate loads
 * as a deferred/async external script, so it cannot run its ARM64 fingerprint
 * check until after we have already read the data.
 *
 * @param {string} url - The configured Homegate search URL.
 * @returns {Promise<object[]>} Raw listing objects for the normalize() pipeline step.
 */
async function getListings(url) {
  const settings = await getSettings();
  const proxyUrl = typeof settings?.proxyUrl === 'string' ? settings.proxyUrl.trim() : '';

  let browser;
  try {
    browser = await launchBrowser(url, proxyUrl ? { proxyUrl } : {});
    const page = await browser.newPage();

    // Warm-up: visit the homepage first so Homegate/DataDome sees an established session
    // before we hit the search URL directly.
    try {
      await page.goto('https://www.homegate.ch/', { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
    } catch {
      // ignore — warm-up failure should not block the main request
    }

    logger.debug(`[Homegate] Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    // DataDome intercepts at the CDN edge and serves a JS challenge page before real content.
    // CloakBrowser can pass the challenge — but we must wait for __INITIAL_STATE__ to appear
    // after the challenge resolves and the real Homegate page loads.
    logger.debug('[Homegate] Waiting for __INITIAL_STATE__ (DataDome challenge may run first)…');
    try {
      await page.waitForFunction(() => typeof window.__INITIAL_STATE__ !== 'undefined', { timeout: 25_000 });
    } catch {
      logger.warn('[Homegate] Timed out waiting for __INITIAL_STATE__ — DataDome challenge did not resolve');
    }

    const state = await page.evaluate(() => window.__INITIAL_STATE__ ?? null);

    if (!state) {
      const snippet = (await page.content()).slice(0, 300);
      logger.warn(`[Homegate] window.__INITIAL_STATE__ not found. Page preview: ${snippet}`);
      return [];
    }

    const listings = state?.resultList?.search?.fullSearch?.result?.listings ?? [];
    logger.debug(`[Homegate] Extracted ${listings.length} listings from __INITIAL_STATE__`);

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
      const addressStr = [addr.street, addr.postalCode, addr.locality].filter(Boolean).join(', ') || null;
      const rentAmount = prices.rent?.gross ?? prices.buy?.price ?? null;
      const priceStr = rentAmount != null ? `CHF ${rentAmount}` : null;
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
        image: null,
      };
    });
  } catch (err) {
    logger.error(`[Homegate] getListings failed: ${err.message}`);
    return [];
  } finally {
    if (browser) await closeBrowser(browser);
  }
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
