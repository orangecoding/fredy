/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import { readJsonLdPrice } from '../utils/priceExtractors.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
import { extractBuildingFacts } from '../utils/buildingFacts.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

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
    const html = await puppeteerExtractor(listing.link, null, { browser, name: 'immobilienDe_details' });
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

    const fullDescription = description || listing.description;

    return {
      ...listing,
      address,
      description: fullDescription,
      ...extractBuildingFacts(fullDescription),
    };
  } catch (error) {
    logger.warn(`Could not fetch immobilien.de detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}
/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const baseUrl = 'https://www.immobilien.de';
  const title = o.title || '';
  const address = o.address || null;
  const shortLink = shortenLink(o.link);
  const link = shortLink ? (shortLink.startsWith('http') ? shortLink : baseUrl + shortLink) : baseUrl;
  const image = o.image ? (o.image.startsWith('http') ? o.image : baseUrl + o.image) : null;
  const id = buildHash(parseId(shortLink), o.price);
  return {
    id,
    link,
    title,
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address,
    image,
    description: o.description,
  };
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList Terms the job wants filtered out.
 * @returns {boolean}
 */
function applyBlacklist(o, appliedBlackList) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  crawlContainer: 'a.lr-card',
  sortByDateParam: 'sort_col=*created_ts&sort_dir=desc',
  waitForSelector: null,
  crawlFields: {
    id: '@href', //will be transformed later
    price: '.lr-card__price-amount | trim',
    size: '.lr-card__fact:has(.lr-card__fact-label:contains("Fläche")) .lr-card__fact-value | trim',
    rooms: '.zimmer .label_info',
    title: '.lr-card__title | trim',
    description: '.description | trim',
    link: '@href',
    address: '.lr-card__address span | trim',
    image: 'img.lr-card__gallery-img@src',
  },
  normalize,
  fetchDetails,
  activityProbe: checkIfListingIsActive,
  priceTracking: {
    // The RealEstateListing block carries the same figure as the list card's price amount. Note the
    // block is not valid JSON - the description contains raw newlines - which is exactly the case
    // `readJsonLdPrice` falls back to a text scan for.
    extract: readJsonLdPrice,
  },
};
/**
 * Build a run-scoped provider configuration.
 *
 * Returns a fresh object on every call instead of mutating module-level state. Two jobs can be in
 * flight at once - a manual run started while the scheduler is working through the others - and a
 * shared mutable config meant the second job overwrote the first job's URL and blacklist mid-run,
 * so listings were fetched for one job and stored under another.
 *
 * @param {{url: string, enabled?: boolean}} sourceConfig The job's entry for this provider.
 * @param {string[]} [blacklist] Terms to filter listings out by.
 * @returns {ProviderConfig} A configuration usable by a single pipeline run.
 */
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});
export const metaInformation = {
  countries: ['de'],
  name: 'Immobilien.de',
  baseUrl: 'https://www.immobilien.de/',
  id: 'immobilienDe',
};
export { config };
