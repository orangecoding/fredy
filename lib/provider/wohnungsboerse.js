/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as utils from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const [city = '', part = ''] = (o.description || '').split('-').map((v) => v.trim());
  const address = `${part}, ${city}`;
  return {
    id: o.link.split('/').pop(),
    link: o.link,
    title: o.title || '',
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address,
    image: o.image,
    description: o.description,
  };
}

/**
 * @param {ParsedListing} o
 * @returns {boolean}
 */
function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return o.id != null && o.title != null && titleNotBlacklisted && descNotBlacklisted && o.link.startsWith(o.link);
}

/** @type {ProviderConfig} */
const config = {
  fieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  sortByDateParam: null,
  waitForSelector: 'body',
  crawlContainer: '.search_result_container > a',
  crawlFields: {
    id: '*',
    title: 'h3 | trim',
    price: 'dl:nth-of-type(1) dd | removeNewline | trim',
    rooms: 'dl:nth-of-type(2) dd | removeNewline | trim',
    size: 'dl:nth-of-type(3) dd | removeNewline | trim',
    description: 'div.before\\:icon-location_marker | trim',
    link: '@href',
    image: 'img@src',
  },
  normalize: normalize,
  filter: applyBlacklist,
  activeTester: checkIfListingIsActive,
};

export const init = (sourceConfig, blacklistTerms) => {
  config.url = sourceConfig.url;
  appliedBlackList = blacklistTerms || [];
};

export const metaInformation = {
  name: 'Wohnungsboerse',
  baseUrl: 'https://www.wohnungsboerse.net',
  id: 'wohnungsboerse',
};

export { config };
