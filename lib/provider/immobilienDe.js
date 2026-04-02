/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';

let appliedBlackList = [];

function shortenLink(link) {
  if (!link) return '';
  const index = link.indexOf('?');
  return index === -1 ? link : link.substring(0, index);
}

function parseId(shortenedLink) {
  return shortenedLink.substring(shortenedLink.lastIndexOf('/') + 1);
}

async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, null, { browser });
    if (!html) return listing;

    const $ = cheerio.load(html);

    // Try JSON-LD first
    let description = null;
    let address = listing.address;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (description) return;
      try {
        const data = JSON.parse($(el).text());
        const nodes = Array.isArray(data) ? data : [data];
        for (const node of nodes) {
          if (node.description && !description) description = String(node.description).replace(/\s+/g, ' ').trim();
          const addr = node.address || node?.mainEntity?.address;
          if (addr && addr.streetAddress && address === listing.address) {
            const parts = [addr.streetAddress, addr.postalCode, addr.addressLocality].filter(Boolean);
            if (parts.length) address = parts.join(' ');
          }
        }
      } catch {
        // ignore malformed JSON-LD
      }
    });

    // Fallback: common description selectors used by immobilien.de
    if (!description) {
      const sel = ['.beschreibung', '.freitext', '.objektbeschreibung', '.description'].find((s) => $(s).length > 0);
      if (sel) description = $(sel).text().replace(/\s+/g, ' ').trim();
    }

    return {
      ...listing,
      address,
      description: description || listing.description,
    };
  } catch (error) {
    logger.warn(`Could not fetch immobilien.de detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

function normalize(o) {
  const baseUrl = 'https://www.immobilien.de';
  const size = o.size || null;
  const price = o.price || null;
  const title = o.title || 'No title available';
  const address = o.address || null;
  const shortLink = shortenLink(o.link);
  const link = shortLink ? (shortLink.startsWith('http') ? shortLink : baseUrl + shortLink) : baseUrl;
  const image = o.image ? (o.image.startsWith('http') ? o.image : baseUrl + o.image) : null;
  const id = buildHash(parseId(shortLink), o.price);
  return Object.assign(o, { id, price, size, title, address, link, image });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  url: null,
  crawlContainer: 'a.lr-card',
  sortByDateParam: 'sort_col=*created_ts&sort_dir=desc',
  waitForSelector: 'a.lr-card',
  crawlFields: {
    id: '@href', //will be transformed later
    price: '.lr-card__price-amount | trim',
    size: '.lr-card__fact:has(.lr-card__fact-label:contains("Fläche")) .lr-card__fact-value | trim',
    title: '.lr-card__title | trim',
    description: '.description | trim',
    link: '@href',
    address: '.lr-card__address span | trim',
    image: 'img.lr-card__gallery-img@src',
  },
  normalize: normalize,
  filter: applyBlacklist,
  fetchDetails,
  activeTester: checkIfListingIsActive,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immobilien.de',
  baseUrl: 'https://www.immobilien.de/',
  id: 'immobilienDe',
};
export { config };
