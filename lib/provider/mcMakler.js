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
  const originalId = o.id.split('/').pop();
  const id = buildHash(originalId, o.price);
  const link = o.link != null ? `https://www.mcmakler.de${o.link}` : o.link;
  const [rooms, size] = o.tags.split(' | ');
  const address = o.address?.replace(' / ', ' ') || null;
  return {
    id,
    link,
    title: o.title || '',
    price: extractNumber(o.price),
    size: extractNumber(size),
    rooms: extractNumber(rooms),
    address,
    image: o.image,
    description: undefined,
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
  crawlContainer: 'article[data-testid="propertyCard"]',
  sortByDateParam: 'sortBy=DATE&sortOn=DESC',
  waitForSelector: 'ul[data-testid="listsContainer"]',
  crawlFields: {
    id: 'h2 a@href',
    title: 'h2 a | removeNewline | trim',
    price: 'footer > p:first-of-type | trim',
    tags: 'footer > p:nth-of-type(2) | trim',
    address: 'div > h2 + p | removeNewline | trim',
    image: 'img@src',
    link: 'h2 a@href',
  },
  normalize: normalize,
  filter: applyBlacklist,
  activeTester: checkIfListingIsActive,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'McMakler',
  baseUrl: 'https://www.mcmakler.de/immobilien/',
  id: 'mcMakler',
};
export { config };
