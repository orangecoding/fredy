/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.mcmakler.de';

let appliedBlackList = [];

/**
 * The listing cards no longer carry the title as visible text. The only place it survives is the
 * aria label of the overlay link, which reads `<title>, <address>, <price>, <primary stat>`.
 * Titles themselves may contain commas, so the address is used as anchor and the trailing
 * segments are dropped as fallback.
 *
 * @param {string|null|undefined} ariaLabel aria label of the card's overlay link
 * @param {string|null|undefined} address address as shown on the card, e.g. `40627 Düsseldorf`
 * @returns {string} the plain listing title or an empty string if it cannot be determined
 */
function extractTitle(ariaLabel, address) {
  if (!ariaLabel) return '';

  if (address) {
    const addressMarker = `, ${address},`;
    const addressIndex = ariaLabel.lastIndexOf(addressMarker);
    if (addressIndex > 0) {
      return ariaLabel.slice(0, addressIndex).trim();
    }
  }

  const segments = ariaLabel.split(',');
  return (segments.length > 3 ? segments.slice(0, -3).join(',') : ariaLabel).trim();
}

/**
 * The card stats are only available as aria labels with a leading description,
 * e.g. `Wohnfläche 95 m²` or `4 Zimmer`, so the number has to be picked out first.
 *
 * @param {string|null|undefined} statLabel aria label of a single card stat
 * @returns {number|null} the number contained in the label or null if there is none
 */
function extractStatNumber(statLabel) {
  const match = statLabel?.match(/\d+(?:[.,]\d+)*/);
  return match == null ? null : extractNumber(match[0]);
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const originalId = (o.id || '').split('/').pop();
  const id = buildHash(originalId, o.price);
  const link = o.link != null ? `${BASE_URL}${o.link}` : o.link;
  const address = o.address?.replace(' / ', ' ') || null;
  // plots do not have a living space, for those the plot size is the only meaningful size
  const size = extractStatNumber(o.livingSpace) ?? extractStatNumber(o.plotSize);
  return {
    id,
    link,
    title: extractTitle(o.ariaLabel, address),
    price: extractNumber(o.price),
    size,
    rooms: extractStatNumber(o.rooms),
    address,
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
/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  crawlContainer: 'article[id^="listing-card-"]',
  sortByDateParam: 'sort=newest',
  // the extractor returns the inner html of this element, so it has to wrap all listing cards
  waitForSelector: 'section[aria-label="Immobilienliste"]',
  crawlFields: {
    id: 'a[href*="/expose/"]@href',
    link: 'a[href*="/expose/"]@href',
    // holds title, address, price and the primary stat, see extractTitle
    ariaLabel: 'a[href*="/expose/"]@aria-label',
    price: 'p | removeNewline | trim',
    address: 'h2 | removeNewline | trim',
    livingSpace: '[data-testid="card-stats"] div[aria-label^="Wohnfläche"]@aria-label',
    plotSize: '[data-testid="card-stats"] div[aria-label^="Grundstücksfläche"]@aria-label',
    rooms: '[data-testid="card-stats"] div[aria-label*="Zimmer"]@aria-label',
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
  name: 'McMakler',
  baseUrl: 'https://www.mcmakler.de/immobilien/',
  id: 'mcMakler',
};
export { config };
