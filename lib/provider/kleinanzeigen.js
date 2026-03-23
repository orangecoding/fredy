/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

let appliedBlackList = [];
let appliedBlacklistedDistricts = [];

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const parts = (o.tags || '').split('·').map((p) => p.trim());
  const size = parts.find((p) => p.includes('m²'));
  const rooms = parts.find((p) => p.includes('Zi.'));
  const id = buildHash(o.id, o.price);
  const link = `https://www.kleinanzeigen.de${o.link}`;

  return {
    id,
    title: o.title,
    link,
    price: extractNumber(o.price),
    size: extractNumber(size),
    rooms: extractNumber(rooms),
    address: o.address,
    description: o.description,
    image: o.image,
  };
}

/**
 * @param {ParsedListing} o
 * @returns {boolean}
 */
function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  const isBlacklistedDistrict =
    appliedBlacklistedDistricts.length === 0 ? false : isOneOf(o.description, appliedBlacklistedDistricts);
  return o.title != null && !isBlacklistedDistrict && titleNotBlacklisted && descNotBlacklisted;
}

/** @type {ProviderConfig} */
const config = {
  fieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  crawlContainer: '#srchrslt-adtable .ad-listitem ',
  //sort by date is standard oO
  sortByDateParam: null,
  waitForSelector: 'body',
  crawlFields: {
    id: '.aditem@data-adid',
    price: '.aditem-main--middle--price-shipping--price | removeNewline | trim',
    tags: '.aditem-main--middle--tags | removeNewline | trim',
    title: '.aditem-main .text-module-begin a | removeNewline | trim',
    link: '.aditem-main .text-module-begin a@href | removeNewline | trim',
    description: '.aditem-main .aditem-main--middle--description | removeNewline | trim',
    address: '.aditem-main--top--left | trim | removeNewline',
    image: 'img@src',
  },
  normalize: normalize,
  filter: applyBlacklist,
  activeTester: checkIfListingIsActive,
};
export const metaInformation = {
  name: 'Ebay Kleinanzeigen',
  baseUrl: 'https://www.kleinanzeigen.de/',
  id: 'kleinanzeigen',
};
export const init = (sourceConfig, blacklist, blacklistedDistricts) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlacklistedDistricts = blacklistedDistricts || [];
  appliedBlackList = blacklist || [];
};
export { config };
