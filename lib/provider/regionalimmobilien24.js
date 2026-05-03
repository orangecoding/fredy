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
  const id = buildHash(o.id, o.price);
  const address = o.address?.replace(/^adresse /i, '') ?? null;
  const link = o.link != null ? decodeURIComponent(o.link) : config.url;

  const urlReg = new RegExp(/url\((.*?)\)/gim);
  const image = o.image != null ? urlReg.exec(o.image)[1] : null;
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
 * @returns {boolean}
 */
function applyBlacklist(o) {
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
  filter: applyBlacklist,
  activeTester: checkIfListingIsActive,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Regionalimmobilien24',
  baseUrl: 'https://www.regionalimmobilien24.de/',
  id: 'regionalimmobilien24',
};
export { config };
