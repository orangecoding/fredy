/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';

let appliedBlackList = [];

function nullOrEmpty(val) {
  return val == null || val.length === 0;
}

function normalize(o) {
  const link = nullOrEmpty(o.link)
    ? 'NO LINK'
    : `https://www.neubaukompass.de${o.link.substring(o.link.indexOf('/neubau'))}`;
  const id = buildHash(o.link, o.price);
  return Object.assign(o, { id, link });
}

function applyBlacklist(o) {
  return !isOneOf(o.title, appliedBlackList);
}

const config = {
  url: null,
  crawlContainer: '.col-12.mb-4',
  sortByDateParam: 'Sortierung=Id&Richtung=DESC',
  waitForSelector: 'div[data-live-name-value="SearchList"]',
  crawlFields: {
    id: 'a@href',
    title: 'a@title | removeNewline | trim',
    link: 'a@href',
    address: '.nbk-project-card__description | removeNewline | trim',
    price: '.nbk-project-card__spec-item .nbk-project-card__spec-value | removeNewline | trim',
    image: '.nbk-project-card__image@src',
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
  name: 'Neubau Kompass',
  baseUrl: 'https://www.neubaukompass.de/',
  id: 'neubauKompass',
};
export { config };
