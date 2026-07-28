/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

function nullOrEmpty(val) {
  return val == null || val.length === 0;
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const link = nullOrEmpty(o.link)
    ? 'NO LINK'
    : `https://www.neubaukompass.de${o.link.substring(o.link.indexOf('/neubau'))}`;
  const id = buildHash(o.link, o.price);
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
  crawlContainer: '.nbk-project-cards-container',
  sortByDateParam: 'sort=firstactivation',
  // the extractor returns the inner html of this element, so it has to wrap all project cards
  waitForSelector: 'div[data-live-name-value="SearchFilter"]',
  crawlFields: {
    id: 'a@href',
    title: 'a@title | removeNewline | trim',
    link: 'a@href',
    address: '.nbk-project-card__description | removeNewline | trim',
    price: '.nbk-project-card__spec-item:nth-child(1) .nbk-project-card__spec-value | removeNewline | trim',
    size: '.nbk-project-card__spec-item:nth-child(2) .nbk-project-card__spec-value | removeNewline | trim',
    rooms: '.nbk-project-card__spec-item:nth-child(3) .nbk-project-card__spec-value | removeNewline | trim',
    image: '.nbk-project-card__image@src',
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
  name: 'Neubau Kompass',
  baseUrl: 'https://www.neubaukompass.de/',
  id: 'neubauKompass',
};
export { config };
