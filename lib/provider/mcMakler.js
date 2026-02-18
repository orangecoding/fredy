/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
let appliedBlackList = [];

function normalize(o) {
  const originalId = o.id.split('/').pop();
  const id = buildHash(originalId, o.price);
  const size = o.size ?? 'N/A m²';
  const title = o.title || 'No title available';
  const address = o.address?.replace(' / ', ' ') || null;
  const link = o.link != null ? `https://www.mcmakler.de${o.link}` : config.url;
  return Object.assign(o, { id, size, title, link, address });
}
function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}
const config = {
  url: null,
  crawlContainer: 'article[data-testid="propertyCard"]',
  sortByDateParam: 'sortBy=DATE&sortOn=DESC',
  waitForSelector: 'ul[data-testid="listsContainer"]',
  crawlFields: {
    id: 'h2 a@href',
    title: 'h2 a | removeNewline | trim',
    price: 'footer > p:first-of-type | trim',
    size: 'footer > p:nth-of-type(2) | trim',
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
  currency: 'EUR',
};
export { config };
