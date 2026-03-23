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

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const baseUrl = 'https://www.1a-immobilienmarkt.de';
  const link = `${baseUrl}/expose/${o.id}.html`;
  const price = normalizePrice(o.price);
  const id = buildHash(o.id, price);
  const image = baseUrl + o.image;
  const address = o.address == null ? null : o.address.trim().replaceAll('/', ',');
  return {
    id,
    link,
    title: o.title || '',
    price: extractNumber(price),
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address,
    image,
    description: undefined,
  };
}

/**
 * einsAImmobilien sometimes use a weird pricing label such as `775.700,00 EUR Kaufpreis ab 2.475 € mtl`.
 * Make sure to extract only the actual price out of the string.
 * @param price
 * @returns {*}
 */
function normalizePrice(price) {
  if (price == null) {
    return null;
  }
  const regex = /(\d{1,3}(?:\.\d{3})*,\d{2})\s?(EUR|€)/g;
  const result = price.match(regex);
  if (result == null || result.length === 0) {
    return price;
  }
  return result[0];
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
  crawlContainer: '.tabelle',
  sortByDateParam: 'sort_type=newest',
  waitForSelector: 'body',
  crawlFields: {
    id: '.inner_object_data input[name="marker_objekt_id"]@value | int',
    price: '.inner_object_data .single_data_price | removeNewline | trim',
    size: '.tabelle .tabelle_inhalt_infos .single_data_box:nth-of-type(1) | removeNewline | trim',
    rooms: '.tabelle .tabelle_inhalt_infos .single_data_box:nth-of-type(2) | removeNewline | trim',
    title: '.inner_object_data .tabelle_inhalt_titel_black | removeNewline | trim',
    image: '.inner_object_pic img@src',
    address: '.tabelle .tabelle_inhalt_infos .left_information > div:nth-child(2) | removeNewline | trim',
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
  name: '1a Immobilien',
  baseUrl: 'https://www.1a-immobilienmarkt.de/',
  id: 'einsAImmobilien',
};
export { config };
