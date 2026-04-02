/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
let appliedBlackList = [];

function normalize(o) {
  const originalId = o.id.split('/').pop().replace('.html', '');
  const id = buildHash(originalId, o.price);
  const size = o.size?.replace(' Wohnfläche', '').replace(' m²', 'm²') ?? null;
  const title = o.title || 'No title available';
  const link = o.link != null ? `https://immobilien.sparkasse.de${o.link}` : config.url;
  return Object.assign(o, { id, size, title, link });
}
function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}
const config = {
  url: null,
  crawlContainer: 'div[data-testid="estate-link"]',
  sortByDateParam: 'sortBy=date_desc',
  waitForSelector: 'body',
  crawlFields: {
    id: 'a@href',
    title: 'h3 | trim',
    price: '.estate-list-price | trim',
    size: '.estate-mainfact span | trim',
    address: 'h6 | trim',
    image: 'img@src',
    link: 'a@href',
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
