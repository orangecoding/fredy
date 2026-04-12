/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
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

    $('#freitext_0 script').remove();
    const description = $('#freitext_0').text().replace(/\s+/g, ' ').trim();
    const address = $('a[href="#map_container"] .section_panel_detail').text().replace(/\s+/g, ' ').trim();

    return {
      ...listing,
      address: address || listing.address,
      description: description || listing.description,
    };
  } catch (error) {
    logger.warn(`Could not fetch wgGesucht detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}
/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const id = buildHash(o.id, o.price);
  const link = `https://www.wg-gesucht.de${o.link}`;
  const image = o.image != null ? o.image.replace('small', 'large') : null;
  const [rooms, city, road] = o.details?.split(' | ') || [];
  return {
    id,
    link,
    title: o.title || '',
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(rooms),
    address: `${city}, ${road}`,
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
  return o.id != null && titleNotBlacklisted && descNotBlacklisted;
}

/** @type {ProviderConfig} */
const config = {
  url: null,
  crawlContainer: '#main_column .wgg_card',
  sortByDateParam: 'sort_column=0&sort_order=0',
  waitForSelector: 'body',
  crawlFields: {
    id: '@data-id',
    details: '.row .noprint .col-xs-11 |removeNewline |trim',
    price: '.middle .col-xs-3 |removeNewline |trim',
    size: '.middle .text-right |removeNewline |trim',
    rooms: '.middle .text-right |removeNewline |trim',
    title: '.truncate_title a |removeNewline |trim',
    link: '.truncate_title a@href',
    image: '.img-responsive@src',
    description: '.row .noprint .col-xs-11 |removeNewline |trim',
  },
  fieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
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
  name: 'Wg gesucht',
  baseUrl: 'https://www.wg-gesucht.de/',
  id: 'wgGesucht',
};
export { config };
