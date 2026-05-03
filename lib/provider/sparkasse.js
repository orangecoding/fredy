/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
import { extractNumber } from '../utils/extract-number.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];

async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, 'body', { browser });

    const $ = cheerio.load(html);
    const nextDataRaw = $('#__NEXT_DATA__').text;
    if (!nextDataRaw) return listing;

    const estate = JSON.parse(nextDataRaw)?.props?.pageProps?.estate;
    if (!estate) return listing;

    const description = (estate.frontendItems || [])
      .map((item) => {
        const texts = (item.contents || [])
          .filter((c) => c.type === 'contentBoxes')
          .flatMap((c) => c.data || [])
          .filter((d) => d.type === 'text' && d.content)
          .map((d) => d.content);
        if (!texts.length) return null;
        return [item.label, ...texts].filter(Boolean).join('\n');
      })
      .filter(Boolean)
      .join('\n\n');

    const addr = estate.address;
    let address = listing.address;
    if (addr) {
      const street = [addr.street, addr.streetNumber].filter(Boolean).join(' ');
      const cityLine = [addr.zip, addr.city].filter(Boolean).join(' ');
      const full = [street, cityLine].filter(Boolean).join(', ');
      if (full) address = full;
    }

    return {
      ...listing,
      address,
      description: description || listing.description,
    };
  } catch (error) {
    logger.warn(`Could not fetch Sparkasse detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const originalId = o.id.split('/').pop().replace('.html', '');
  const id = buildHash(originalId, o.price);
  const link = o.link != null ? `https://immobilien.sparkasse.de${o.link}` : config.url;

  return {
    id,
    link,
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
  crawlContainer: 'div[data-testid="estate-link"]',
  sortByDateParam: 'sortBy=date_desc',
  waitForSelector: 'body',
  crawlFields: {
    id: 'a@href',
    title: 'h3 | trim',
    price: '.estate-list-price | trim',
    size: '.estate-mainfact:nth-child(1) span | trim',
    rooms: '.estate-mainfact:nth-child(2) span | trim',
    address: 'h6 | trim',
    image: 'img@src',
    link: 'a@href',
  },
  normalize: normalize,
  filter: applyBlacklist,
  fetchDetails,
  activeTester: (url) => checkIfListingIsActive(url, 'Angebot nicht gefunden'),
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Sparkasse Immobilien',
  baseUrl: 'https://immobilien.sparkasse.de/',
  id: 'sparkasse',
};
export { config };
