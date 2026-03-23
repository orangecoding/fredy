/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
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
  const originalId = o.id.split('/').pop().replace('.html', '');
  const id = buildHash(originalId, o.price);
  const link = o.link != null ? `https://immobilien.sparkasse.de${o.link}` : o.link;
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
  fieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  crawlContainer: '.estate-list-item-row',
  sortByDateParam: 'sortBy=date_desc',
  waitForSelector: 'body',
  crawlFields: {
    id: 'div[data-testid="estate-link"] a@href',
    title: 'h3 | trim',
    price: '.estate-list-price | trim',
    size: '.estate-mainfact:nth-child(1) span | trim',
    rooms: '.estate-mainfact:nth-child(2) span | trim',
    address: 'h6 | trim',
    image: '.estate-list-item-image-container img@src',
    link: 'div[data-testid="estate-link"] a@href',
  },
  normalize: normalize,
  filter: applyBlacklist,
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
