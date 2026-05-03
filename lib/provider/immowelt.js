/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];

async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, null, { browser });
    if (!html) return listing;

    const $ = cheerio.load(html);
    const nextDataRaw = $('#__NEXT_DATA__').text();
    if (!nextDataRaw) return listing;

    const classified = JSON.parse(nextDataRaw)?.props?.pageProps?.classified;
    if (!classified) return listing;

    const description = (classified.Texts || [])
      .map((t) => [t.Title, t.Content].filter(Boolean).join('\n'))
      .filter(Boolean)
      .join('\n\n');

    const addr = classified.EstateAddress;
    let address = listing.address;
    if (addr) {
      const street = [addr.Street, addr.HouseNumber].filter(Boolean).join(' ');
      const cityLine = [addr.ZipCode, addr.District || addr.City].filter(Boolean).join(' ');
      const full = [street, cityLine].filter(Boolean).join(', ');
      if (full) address = full;
    }

    return {
      ...listing,
      address,
      description: description || listing.description,
    };
  } catch (error) {
    logger.warn(`Could not fetch immowelt detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const id = buildHash(o.id, o.price);
  return {
    id,
    link: o.link,
    title: o.title || '',
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address: o.address,
    image: o.image,
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
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  crawlContainer:
    'div[data-testid="serp-core-scrollablelistview-testid"]:not(div[data-testid="serp-enlargementlist-testid"] div[data-testid="serp-card-testid"]) div[data-testid="serp-core-classified-card-testid"]',
  sortByDateParam: 'order=DateDesc',
  waitForSelector: 'div[data-testid="serp-gridcontainer-testid"]',
  crawlFields: {
    id: 'a@href',
    price: 'div[data-testid="cardmfe-price-testid"] | removeNewline | trim',
    size: 'div[data-testid="cardmfe-keyfacts-testid"] div:nth-of-type(3) | removeNewline | trim',
    rooms: 'div[data-testid="cardmfe-keyfacts-testid"] div:nth-of-type(1) | removeNewline | trim',
    title: 'div[data-testid="cardmfe-description-box-text-test-id"] > div:nth-of-type(2)',
    link: 'a@href',
    description: 'div[data-testid="cardmfe-description-text-test-id"] > div:nth-of-type(2) | removeNewline | trim',
    address: 'div[data-testid="cardmfe-description-box-address"] | removeNewline | trim',
    image: 'div[data-testid="cardmfe-picture-box-opacity-layer-test-id"] img@src',
  },
  normalize: normalize,
  filter: applyBlacklist,
  fetchDetails: fetchDetails,
  activeTester: checkIfListingIsActive,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immowelt',
  baseUrl: 'https://www.immowelt.de/',
  id: 'immowelt',
};
export { config };
