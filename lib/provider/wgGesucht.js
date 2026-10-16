/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
import { extractBuildingFacts } from '../utils/buildingFacts.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, null, { browser, name: 'wgGesucht_details' });
    if (!html) return listing;

    const $ = cheerio.load(html);

    $('#freitext_0 script').remove();
    const description = $('#freitext_0').text().replace(/\s+/g, ' ').trim();
    const address = $('a[href="#map_container"] .section_panel_detail').text().replace(/\s+/g, ' ').trim();

    const fullDescription = description || listing.description;

    return {
      ...listing,
      address: address || listing.address,
      description: fullDescription,
      ...extractBuildingFacts(fullDescription),
    };
  } catch (error) {
    logger.warn(`Could not fetch wgGesucht detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}
/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const id = buildHash(o.id, o.price);
  const link = `https://www.wg-gesucht.de${o.link}`;
  const image = o.image != null ? o.image.replace('small', 'large') : null;
  // "3er WG · Düsseldorf Oberbilk · Ellerstraße": the size of the flat share, then where it is.
  const [rooms, city, road] = o.details?.split('·').map((part) => part.trim()) || [];
  const address = [city, road].filter(Boolean).join(', ') || null;
  return {
    id,
    link,
    title: o.title || '',
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(rooms),
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
  return o.id != null && titleNotBlacklisted && descNotBlacklisted;
}

/** @type {ProviderConfig} */
const config = {
  url: null,
  // Each result is one `a.offer_list_item`, the link to the listing included. The partner ads in
  // between carry no `data-id` and drop out on that. A pinned listing is left out here instead: its
  // card links back to the search with an `asset_id` rather than to the listing, and the same listing
  // turns up again at its own address further down.
  crawlContainer: '#main_column .offer_list_item:not(.premium_sticky_asset)',
  sortByDateParam: 'sort_column=0&sort_order=0',
  // WG-Gesucht encodes its search in the numbered path segments of `.30.0.1.0.html` and the price
  // filter is not among them, so it leaves no trace in the URL.
  priceRangeParams: null,
  waitForSelector: 'body',
  crawlFields: {
    id: '@data-id',
    details: '.ad-subtitle |removeNewline |trim',
    price: '.price-row .card-main-text |removeNewline |trim',
    size: '.size-value |removeNewline |trim',
    title: '.ad-title |removeNewline |trim',
    link: '@href',
    image: 'img.top-image-card@src',
    description: '.ad-subtitle |removeNewline |trim',
  },
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  normalize: normalize,
  fetchDetails,
  activityProbe: checkIfListingIsActive,
  priceTracking: {
    /**
     * The search list shows the Gesamtmiete, and the exposé states it as a key fact next to the room
     * size. The "Kosten" panel below is no substitute: its first figure is the Miete without the
     * Nebenkosten, which matches the list only for a room that has none and would otherwise record
     * a price drop on every check.
     *
     * @param {string} html
     * @returns {string|null}
     */
    extract: (html) => {
      const $ = cheerio.load(html);
      const label = $('.key_fact_detail')
        .filter((_, element) => $(element).text().trim() === 'Gesamtmiete')
        .first();
      const text = label.parent().find('.key_fact_value').first().text().trim();
      return extractNumber(text) > 0 ? text : null;
    },
  },
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
  countries: ['de'],
  name: 'Wg gesucht',
  baseUrl: 'https://www.wg-gesucht.de/',
  id: 'wgGesucht',
};
export { config };
