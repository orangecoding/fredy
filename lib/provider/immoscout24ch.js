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
 * ImmoScout24.ch uses DataDome bot protection - requires residential proxy
 * and optionally 2Captcha for captcha solving.
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { buildHash, isOneOf, nullOrEmpty } from '../utils.js';
import {
  getPreLaunchConfig,
  applyBotPreventionToPage,
  applyLanguagePersistence,
  applyPostNavigationHumanSignals,
} from '../services/extractor/botPrevention.js';
import {
  detectDataDomeCaptcha,
  solveDataDomeCaptcha,
  applyDataDomeCookie,
} from '../services/captcha/dataDomeSolver.js';
import logger from '../services/logger.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

puppeteer.use(StealthPlugin());

let appliedBlackList = [];

/**
 * Extract listings from __INITIAL_STATE__ JSON.
 * Path: window.__INITIAL_STATE__.resultList.search.fullSearch.result.listings
 */
function extractListingsFromState(initialState) {
  try {
    const listings = initialState?.resultList?.search?.fullSearch?.result?.listings;
    if (!Array.isArray(listings)) {
      logger.warn('ImmoScout24.ch: No listings array found in __INITIAL_STATE__');
      return [];
    }
    return listings;
  } catch (err) {
    logger.error('ImmoScout24.ch: Error extracting listings from __INITIAL_STATE__:', err);
    return [];
  }
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
  const categories = listing.categories || [];

  // Build price string
  let priceStr = '';
  if (prices.rent?.gross) {
    priceStr = `CHF ${prices.rent.gross}`;
    if (prices.rent.interval === 'MONTH') priceStr += '/month';
  } else if (prices.buy?.price) {
    priceStr = `CHF ${prices.buy.price}`;
  }

  // Build size string
  let sizeStr = '';
  if (characteristics.numberOfRooms) {
    sizeStr += `${characteristics.numberOfRooms} rooms`;
  }
  if (characteristics.livingSpace) {
    sizeStr += sizeStr ? `, ${characteristics.livingSpace} m²` : `${characteristics.livingSpace} m²`;
  }

  // Build address string
  const addressParts = [];
  if (address.street) addressParts.push(address.street);
  if (address.postalCode || address.locality) {
    addressParts.push([address.postalCode, address.locality].filter(Boolean).join(' '));
  }
  const addressStr = addressParts.join(', ');

  // Find first image
  const imageAttachment = attachments.find((a) => a.type === 'IMAGE');
  const imageUrl = imageAttachment?.url || '';

  // Build detail URL with proper property type and sanitized locality
  const listingId = listing.id || item.id;
  const offerType = listing.offerType === 'BUY' ? 'buy' : 'rent';
  const propertyType = getPropertyTypeSlug(categories);
  const locality = sanitizeLocality(address.locality);
  const link = `https://www.immoscout24.ch/en/d/${propertyType}-${offerType}-${locality}/${listingId}`;

  return {
    id: listingId,
    title: text.title || '',
    description: text.description || '',
    price: priceStr,
    size: sizeStr,
    address: addressStr,
    link: link,
    image: imageUrl,
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
 * Custom getListings function that extracts from __INITIAL_STATE__.
 * Called with `this` bound to FredyPipelineExecutioner.
 *
 * @param {string} url The URL to fetch listings from
 * @returns {Promise<Array>} Array of listing objects
 */
async function getListings(url) {
  const globalSettings = this._globalSettings || {};
  let browser;
  let page;
  let userDataDir;
  let removeUserDataDir = false;

  try {
    logger.debug(`ImmoScout24.ch: Fetching listings from ${url}`);

    // Prepare temporary user data directory
    const prefix = path.join(os.tmpdir(), 'puppeteer-immoscout-');
    userDataDir = fs.mkdtempSync(prefix);
    removeUserDataDir = true;

    // Build launch arguments
    const launchArgs = [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-crash-reporter',
      '--no-first-run',
      '--no-default-browser-check',
    ];

    // Add proxy if configured
    if (globalSettings.proxyUrl) {
      launchArgs.push(`--proxy-server=${globalSettings.proxyUrl}`);
      logger.debug('ImmoScout24.ch: Using proxy');
    }

    // Bot prevention config
    const preCfg = getPreLaunchConfig(url, {});
    launchArgs.push(preCfg.langArg);
    launchArgs.push(preCfg.windowSizeArg);
    launchArgs.push(...preCfg.extraArgs);

    browser = await puppeteer.launch({
      headless: true,
      args: launchArgs,
      timeout: 60_000,
      userDataDir,
    });

    page = await browser.newPage();

    // Proxy authentication
    if (globalSettings.proxyUsername && globalSettings.proxyPassword) {
      await page.authenticate({
        username: globalSettings.proxyUsername,
        password: globalSettings.proxyPassword,
      });
    }

    await applyBotPreventionToPage(page, preCfg);
    await applyLanguagePersistence(page, preCfg);

    // Navigate to the page
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await applyPostNavigationHumanSignals(page, preCfg);

    // Wait for the page to fully load (check for __INITIAL_STATE__)
    let initialState = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;

      // Check for DataDome captcha
      const captchaResult = await detectDataDomeCaptcha(page);
      if (captchaResult.detected) {
        if (!globalSettings.twoCaptchaApiKey) {
          logger.warn('ImmoScout24.ch: DataDome captcha detected but no 2Captcha API key configured');
          return [];
        }

        logger.info('ImmoScout24.ch: DataDome captcha detected, solving with 2Captcha...');
        const userAgent = await page.evaluate(() => navigator.userAgent);
        const solveResult = await solveDataDomeCaptcha({
          apiKey: globalSettings.twoCaptchaApiKey,
          websiteUrl: url,
          captchaUrl: captchaResult.captchaUrl,
          userAgent,
          proxy: {
            url: globalSettings.proxyUrl,
            username: globalSettings.proxyUsername,
            password: globalSettings.proxyPassword,
          },
        });

        if (!solveResult.success || !solveResult.cookie) {
          logger.warn(`ImmoScout24.ch: Failed to solve captcha: ${solveResult.error}`);
          return [];
        }

        const domain = new URL(url).hostname.replace(/^www\./, '');
        await applyDataDomeCookie(page, solveResult.cookie, domain);

        // Reload after captcha solve
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await applyPostNavigationHumanSignals(page, preCfg);
      }

      // Try to extract __INITIAL_STATE__
      initialState = await page.evaluate(() => {
        // @ts-ignore
        return window.__INITIAL_STATE__ || null;
      });

      if (initialState) {
        logger.debug('ImmoScout24.ch: Successfully extracted __INITIAL_STATE__');
        break;
      }

      // Wait a bit and retry
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (!initialState) {
      logger.warn('ImmoScout24.ch: Could not extract __INITIAL_STATE__ after multiple attempts');
      return [];
    }

    // Extract and transform listings
    const rawListings = extractListingsFromState(initialState);
    logger.debug(`ImmoScout24.ch: Found ${rawListings.length} listings in __INITIAL_STATE__`);

    const listings = rawListings.map(transformListing);
    return listings;
  } catch (error) {
    logger.error('ImmoScout24.ch: Error fetching listings:', error);
    return [];
  } finally {
    try {
      if (page) await page.close();
    } catch {
      // ignore
    }
    try {
      if (browser) await browser.close();
    } catch {
      // ignore
    }
    try {
      if (removeUserDataDir && userDataDir) {
        await fs.promises.rm(userDataDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  }
}

const config = {
  url: null,
  // These are kept for compatibility but not used when getListings is defined
  crawlContainer: '[data-test^="result-list-item"]',
  sortByDateParam: 'sorting=dateCreated-desc',
  waitForSelector: null, // Not needed for __INITIAL_STATE__ extraction
  proxyRequired: true,
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
  // Custom extraction from __INITIAL_STATE__
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
