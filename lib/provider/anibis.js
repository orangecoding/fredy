/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Anibis.ch provider for Fredy
 * Swiss free classifieds platform owned by SMG (same parent as Homegate/ImmoScout24.ch)
 *
 * Good for finding:
 * - Private landlord listings (no agency fees)
 * - Sublets and direct rentals
 * - Budget-friendly options
 *
 * Uses Next.js SSR - data is embedded in __NEXT_DATA__ script tag.
 * Uses Bright Data Web Unlocker to bypass datacenter IP blocks.
 */

import { buildHash, isOneOf } from '../utils.js';
import logger from '../services/logger.js';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const BRIGHT_DATA_API_URL = 'https://api.brightdata.com/request';

let appliedBlackList = [];

/**
 * Extract __NEXT_DATA__ JSON from HTML page.
 * @param {string} html - Raw HTML content
 * @returns {object|null} Parsed JSON data or null
 */
function extractNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Extract listings from __NEXT_DATA__ structure.
 * Path: props.pageProps.dehydratedState.queries[0].state.data.listings.edges
 * @param {object} nextData - Parsed __NEXT_DATA__ object
 * @returns {Array} Array of listing nodes
 */
function extractListingsFromNextData(nextData) {
  try {
    const queries = nextData?.props?.pageProps?.dehydratedState?.queries;
    if (!Array.isArray(queries) || queries.length === 0) {
      return [];
    }

    // Find the SearchListingsByConstraints query
    const searchQuery = queries.find(
      (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'SearchListingsByConstraints',
    );

    if (!searchQuery) {
      return [];
    }

    const edges = searchQuery.state?.data?.listings?.edges;
    if (!Array.isArray(edges)) {
      return [];
    }

    return edges.map((edge) => edge.node).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Detect language from URL to build correct listing links.
 * @param {string} url - Search URL
 * @returns {string} Language code (fr, de, it, en)
 */
function detectLanguage(url) {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  const lang = pathParts[0];
  if (['fr', 'de', 'it', 'en'].includes(lang)) {
    return lang;
  }
  return 'fr'; // Default to French
}

/**
 * Transform a listing node to Fredy format.
 * @param {object} node - Listing node from __NEXT_DATA__
 * @param {string} lang - Language code for URL
 * @returns {object} Fredy listing format
 */
function transformListing(node, lang) {
  const listingId = node.listingID;

  // Build address from postcode info
  const postcode = node.postcodeInformation?.postcode || '';
  const location = node.postcodeInformation?.locationName || '';
  const canton = node.postcodeInformation?.canton?.shortName || '';
  const addressParts = [postcode, location, canton].filter(Boolean);
  const address = addressParts.join(' ');

  // Get SEO slug for URL based on language
  const seoInfo = node.seoInformation || {};
  const slugMap = {
    fr: seoInfo.frSlug,
    de: seoInfo.deSlug,
    it: seoInfo.itSlug,
    en: seoInfo.frSlug, // English fallback to French
  };
  const slug = slugMap[lang] || seoInfo.frSlug || seoInfo.deSlug || '';

  // Build listing URL
  const link = slug ? `https://www.anibis.ch/${lang}/vi/${slug}/${listingId}` : `https://www.anibis.ch`;

  // Get thumbnail image
  const image = node.thumbnail?.normalRendition?.src || node.thumbnail?.retinaRendition?.src || '';

  return {
    id: listingId,
    title: node.title || '',
    description: node.body || '',
    // Note: Search results return randomized prices (anti-scraping measure).
    // Real price will be fetched from detail page in enrichNewListings.
    price: '',
    size: '', // Anibis doesn't have structured size info in search results
    address: address,
    link: link,
    image: image,
  };
}

/**
 * Fetch HTML via Bright Data Web Unlocker.
 * Falls back to direct fetch if credentials not configured.
 * @param {string} url - URL to fetch
 * @param {object} globalSettings - Global settings with Bright Data credentials
 * @returns {Promise<string>} HTML content
 */
async function fetchHtml(url, globalSettings = {}) {
  const apiToken = globalSettings.brightDataApiToken;
  const zone = globalSettings.brightDataZone;

  if (apiToken && zone) {
    // Use Bright Data proxy to bypass datacenter IP blocks
    logger.debug(`Anibis: Fetching via Bright Data: ${url}`);
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
      throw new Error(`Bright Data API error (${response.status}): ${errorText}`);
    }

    return response.text();
  } else {
    // Direct fetch (works locally but not from datacenter IPs)
    logger.debug(`Anibis: Direct fetch (no Bright Data): ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8,fr;q=0.7',
      },
    });

    if (!response.ok) {
      throw new Error(`Anibis fetch error: ${response.status}`);
    }

    return response.text();
  }
}

/**
 * Fetch and parse listings from Anibis search page.
 * Called with `this` bound to FredyPipelineExecutioner.
 *
 * Uses Bright Data Web Unlocker to bypass datacenter IP blocks.
 * @param {string} url - User's search URL
 * @returns {Promise<Array>} Array of listings in Fredy format
 */
async function getListings(url) {
  const globalSettings = this._globalSettings || {};

  try {
    // Fetch the search page HTML
    const html = await fetchHtml(url, globalSettings);

    // Extract __NEXT_DATA__ JSON
    const nextData = extractNextData(html);
    if (!nextData) {
      logger.warn('Anibis: Could not find __NEXT_DATA__ in page');
      return [];
    }

    // Extract listing nodes
    const nodes = extractListingsFromNextData(nextData);
    if (nodes.length === 0) {
      logger.info('Anibis: Found 0 listings');
      return [];
    }

    // Detect language for URL building
    const lang = detectLanguage(url);

    // Transform to Fredy format
    const listings = nodes.map((node) => transformListing(node, lang));
    logger.info(`Anibis: Found ${listings.length} listings`);
    return listings;
  } catch (error) {
    logger.error('Anibis: Error fetching listings:', error);
    return [];
  }
}

/**
 * Normalize a listing (called by pipeline after getListings).
 *
 * Note: We use only the listing ID for the hash (not price) because Anibis
 * returns randomized prices in search results as an anti-scraping measure.
 * The real price is fetched from detail pages in enrichNewListings.
 */
function normalize(o) {
  const id = buildHash(o.id);
  return Object.assign(o, { id });
}

/**
 * Apply blacklist filter.
 */
function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return o.title != null && titleNotBlacklisted && descNotBlacklisted;
}

/**
 * Fetch the real price from a listing's detail page using Puppeteer.
 * Uses an existing browser page to avoid overhead of launching new browsers.
 * @param {object} page - Puppeteer page instance
 * @param {string} detailUrl - The listing detail page URL
 * @returns {Promise<string>} The formatted price, or empty string if not found
 */
async function fetchDetailPriceWithPage(page, detailUrl) {
  try {
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const html = await page.content();

    const nextData = extractNextData(html);
    if (!nextData) {
      return '';
    }

    // Find the GetListingDetails query
    const queries = nextData.props?.pageProps?.dehydratedState?.queries;
    const detailQuery = queries?.find((q) => q.queryKey?.[0] === 'GetListingDetails');
    const listing = detailQuery?.state?.data?.listing;

    if (listing?.formattedPrice) {
      return listing.formattedPrice;
    }

    return '';
  } catch (error) {
    logger.warn(`Anibis: Failed to fetch detail price from ${detailUrl}:`, error.message);
    return '';
  }
}

/**
 * Enrich new listings by fetching real prices from detail pages.
 * Uses a single Puppeteer browser instance for efficiency.
 * @param {Array} listings - New listings to enrich
 * @returns {Promise<Array>} Enriched listings with real prices
 */
async function enrichNewListings(listings) {
  if (listings.length === 0) {
    return listings;
  }

  logger.info(`Anibis: Fetching real prices for ${listings.length} new listings using Puppeteer`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    const enriched = [];
    for (const listing of listings) {
      const price = await fetchDetailPriceWithPage(page, listing.link);
      logger.debug(`Anibis: ${price ? `Got price "${price}"` : 'Could not get price'} for listing ${listing.id}`);
      enriched.push(price ? { ...listing, price } : listing);
    }

    return enriched;
  } catch (error) {
    logger.error('Anibis: Error enriching listings with Puppeteer:', error);
    return listings;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
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
  enrichNewListings: enrichNewListings,
};

export function init(sourceConfig, blacklist) {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
}

export const metaInformation = {
  name: 'Anibis',
  baseUrl: 'https://www.anibis.ch/',
  id: 'anibis',
};

export { config };
