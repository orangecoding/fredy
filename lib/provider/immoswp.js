/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
/** @import { ParsedListing } from '../types/listing.js' */

let appliedBlackList = [];

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const immoId = o.id.substring(o.id.indexOf('-') + 1, o.id.length);
  const link = `https://immo.swp.de/immobilien/${immoId}`;
  const id = buildHash(immoId, o.price);
  return {
    id,
    link,
    title: o.title || '',
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address: o.address,
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

const config = {
  url: null,
  crawlContainer: '.js-serp-item',
  sortByDateParam: 's=most_recently_updated_first',
  waitForSelector: 'body',
  crawlFields: {
    id: '.js-bookmark-btn@data-id',
    price: 'div.align-items-start div:first-child | trim',
    size: 'div.align-items-start div:nth-child(3) | trim',
    rooms: 'div.align-items-start div:nth-child(2) | trim',
    address: '.js-bookmark-btn@data-address',
    title: '.js-item-title-link@title | trim',
    link: '.ci-search-result__link@href',
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
  name: 'Immo Südwest Presse',
  baseUrl: 'https://immo.swp.de/',
  id: 'immoswp',
};
export { config };
