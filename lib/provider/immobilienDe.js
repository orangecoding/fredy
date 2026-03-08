/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';

let appliedBlackList = [];

function shortenLink(link) {
  if (!link) return '';
  const index = link.indexOf('?');
  return index === -1 ? link : link.substring(0, index);
}

function parseId(shortenedLink) {
  return shortenedLink.substring(shortenedLink.lastIndexOf('/') + 1);
}

function normalize(o) {
  const baseUrl = 'https://www.immobilien.de';
  const size = o.size || null;
  const price = o.price || null;
  const title = o.title || 'No title available';
  const address = o.address || null;
  const shortLink = shortenLink(o.link);
  const link = baseUrl + shortLink;
  const image = baseUrl + o.image;
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
  crawlContainer: 'a:has(div.list_entry)',
  sortByDateParam: 'sort_col=*created_ts&sort_dir=desc',
  waitForSelector: 'body',
  crawlFields: {
    id: '@href', //will be transformed later
    price: '.immo_preis .label_info',
    size: '.flaeche .label_info | removeNewline | trim',
    title: 'h3 span',
    description: '.description | trim',
    link: '@href',
    address: '.place',
    image: 'img@src',
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
  name: 'Immobilien.de',
  baseUrl: 'https://www.immobilien.de/',
  id: 'immobilienDe',
};
export { config };
