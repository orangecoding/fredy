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

  // Use search results price as fallback (enrichNewListings will try to get accurate price)
  // Anibis sometimes randomizes prices in search results, but it's better than nothing
  const searchPrice = node.formattedPrice || '';

  return {
    id: listingId,
    title: node.title || '',
    description: node.body || '',
    price: searchPrice,
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
 * Fetch search page HTML using Puppeteer (bypasses anti-bot measures).
 * @param {string} url - Search URL
 * @returns {Promise<string>} HTML content
 */
async function fetchHtmlWithPuppeteer(url) {
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  logger.info('Anibis: Launching Puppeteer for search page...');
  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    logger.info(`Anibis: Navigating to search page: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const html = await page.content();
    logger.info(`Anibis: Got search page content (${html.length} chars)`);
    return html;
  } finally {
    await browser.close();
  }
}

/**
 * Fetch and parse listings from Anibis search page.
 * Called with `this` bound to FredyPipelineExecutioner.
 *
 * Uses Puppeteer with stealth plugin to bypass anti-bot measures.
 * Falls back to Bright Data if configured, or direct Puppeteer otherwise.
 * @param {string} url - User's search URL
 * @returns {Promise<Array>} Array of listings in Fredy format
 */
async function getListings(url) {
  const globalSettings = this._globalSettings || {};

  try {
    let html;

    // Use Bright Data if configured, otherwise use Puppeteer
    const apiToken = globalSettings.brightDataApiToken;
    const zone = globalSettings.brightDataZone;

    if (apiToken && zone) {
      html = await fetchHtml(url, globalSettings);
    } else {
      // Use Puppeteer to bypass anti-bot measures
      html = await fetchHtmlWithPuppeteer(url);
    }

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
    logger.info(`Anibis: Fetching detail page: ${detailUrl}`);
    await page.goto(detailUrl, { waitUntil: 'networkidle0', timeout: 45000 });

    // Check for Cloudflare challenge and wait for it to pass
    let title = await page.title();
    if (title.includes('Just a moment') || title.includes('Checking')) {
      logger.info(`Anibis: Cloudflare challenge detected, waiting up to 15s...`);
      // Wait for the title to change (challenge completed)
      try {
        await page.waitForFunction(
          () => !document.title.includes('Just a moment') && !document.title.includes('Checking'),
          {
            timeout: 15000,
          },
        );
        title = await page.title();
        logger.info(`Anibis: Challenge passed, new title: "${title}"`);
      } catch {
        logger.warn(`Anibis: Cloudflare challenge did not pass for ${detailUrl}`);
        return '';
      }
    }

    const html = await page.content();
    logger.info(`Anibis: Page title: "${title}"`);

    // First try schema.org JSON-LD which contains the price
    const schemaMatch = html.match(/"price"\s*:\s*(\d+)/);
    if (schemaMatch && schemaMatch[1] !== '0') {
      const priceNum = schemaMatch[1];
      const formatted = `CHF ${priceNum}`;
      logger.info(`Anibis: Found price "${formatted}" via schema.org for ${detailUrl}`);
      return formatted;
    }

    // Try to find Swiss price format in HTML (e.g., "1'782.- pro Monat")
    const swissPriceMatch = html.match(/(\d{1,3}(?:['']\d{3})*)\s*\.-?\s*(?:pro\s+Monat|\/\s*Monat|CHF)/i);
    if (swissPriceMatch && swissPriceMatch[1] !== '0') {
      const formatted = `CHF ${swissPriceMatch[1].replace(/['']/g, "'")}`;
      logger.info(`Anibis: Found price "${formatted}" via Swiss format for ${detailUrl}`);
      return formatted;
    }

    // Try CHF pattern - but exclude CHF 0
    const chfMatch = html.match(/CHF\s*([\d'',.]+)/i);
    if (chfMatch && chfMatch[1] !== '0' && !chfMatch[1].match(/^0+$/)) {
      const formatted = `CHF ${chfMatch[1]}`;
      logger.info(`Anibis: Found price "${formatted}" via CHF pattern for ${detailUrl}`);
      return formatted;
    }

    // Check if page contains challenge or bot detection
    const isChallenged = html.includes('captcha') || html.includes('challenge') || html.includes('blocked');
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || 'NO BODY');
    logger.warn(
      `Anibis: Could not extract price from ${detailUrl}. Challenged: ${isChallenged}, Title: "${title}", Snippet: ${bodyText.substring(0, 300)}`,
    );
    return '';
  } catch (error) {
    logger.error(`Anibis: Failed to fetch detail price from ${detailUrl}:`, error.message);
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
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    };
    // Use PUPPETEER_EXECUTABLE_PATH if set (Docker environment)
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      logger.info(`Anibis: Using Chromium at ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    }
    logger.info('Anibis: Launching Puppeteer browser...');
    browser = await puppeteer.launch(launchOptions);
    logger.info('Anibis: Browser launched successfully');

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );

    const enriched = [];
    let detailPricesFound = 0;
    let searchPricesUsed = 0;
    for (const listing of listings) {
      const detailPrice = await fetchDetailPriceWithPage(page, listing.link);
      if (detailPrice) {
        detailPricesFound++;
        enriched.push({ ...listing, price: detailPrice });
      } else if (listing.price) {
        // Use search results price as fallback
        searchPricesUsed++;
        enriched.push(listing);
      } else {
        enriched.push(listing);
      }
    }

    logger.info(
      `Anibis: Enrichment complete - ${detailPricesFound} from detail pages, ${searchPricesUsed} from search results`,
    );
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
