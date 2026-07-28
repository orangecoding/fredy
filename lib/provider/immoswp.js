/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

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
  activeTester: checkIfListingIsActive,
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
  name: 'Immo Südwest Presse',
  baseUrl: 'https://immo.swp.de/',
  id: 'immoswp',
};
export { config };
