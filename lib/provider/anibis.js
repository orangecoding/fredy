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
 * No bot protection, simple HTTP fetch works.
 */

import { buildHash, isOneOf } from '../utils.js';
import logger from '../services/logger.js';

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
    price: node.formattedPrice || '',
    size: '', // Anibis doesn't have structured size info in search results
    address: address,
    link: link,
    image: image,
  };
}

/**
 * Fetch and parse listings from Anibis search page.
 * @param {string} url - User's search URL
 * @returns {Promise<Array>} Array of listings in Fredy format
 */
async function getListings(url) {
  try {
    // Fetch the search page HTML
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

    const html = await response.text();

    // Extract __NEXT_DATA__ JSON
    const nextData = extractNextData(html);
    if (!nextData) {
      logger.warn('Anibis: Could not find __NEXT_DATA__ in page');
      return [];
    }

    // Extract listing nodes
    const nodes = extractListingsFromNextData(nextData);
    if (nodes.length === 0) {
      return [];
    }

    // Detect language for URL building
    const lang = detectLanguage(url);

    // Transform to Fredy format
    return nodes.map((node) => transformListing(node, lang));
  } catch (error) {
    logger.error('Anibis: Error fetching listings:', error);
    return [];
  }
}

/**
 * Normalize a listing (called by pipeline after getListings).
 */
function normalize(o) {
  const id = buildHash(o.id, o.price);
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
