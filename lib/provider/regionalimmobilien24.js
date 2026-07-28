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
function normalize(o, runUrl) {
  const id = buildHash(o.id, o.price);
  const address = o.address?.replace(/^adresse /i, '') ?? null;
  const link = o.link != null ? decodeURIComponent(o.link) : runUrl;

  const urlReg = new RegExp(/url\((.*?)\)/gim);
  const imageMatch = o.image != null ? urlReg.exec(o.image) : null;
  const image = imageMatch != null ? imageMatch[1] : null;
  return {
    id,
    link,
    title: o.title || '',
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address,
    image,
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
  crawlContainer: '.listentry-content',
  sortByDateParam: null, // sort by date is standard
  waitForSelector: 'body',
  crawlFields: {
    id: '.listentry-iconbar-share@data-sid | trim',
    title: 'h2 | trim',
    price: '.listentry-details-price .listentry-details-v | trim',
    size: '.listentry-details-size .listentry-details-v | trim',
    rooms: '.listentry-details-rooms .listentry-details-v | trim',
    address: '.listentry-adress | trim',
    image: '.listentry-img@style',
    link: '.shariff@data-url',
    description: '.listentry-extras | trim',
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
  // The run's search URL is bound here rather than read from the module-level `config`:
  // that object's `url` is null on the static template and `createConfig` returns a copy,
  // so the module binding is never assigned. Reading it produced a fallback URL for every
  // job regardless of what the user configured.
  normalize: (o) => normalize(o, sourceConfig.url),
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});
export const metaInformation = {
  name: 'Regionalimmobilien24',
  baseUrl: 'https://www.regionalimmobilien24.de/',
  id: 'regionalimmobilien24',
};
export { config };
