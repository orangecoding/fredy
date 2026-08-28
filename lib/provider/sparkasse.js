/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
import { extractNumber } from '../utils/extract-number.js';
import { normalizeBuildYear, normalizeEnergyClass } from '../utils/buildingFacts.js';
import { readNextData } from '../utils/priceExtractors.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

/**
 * Enrich a listing with the description and the exact address of its expose. The portal is a
 * Next.js app, so the detail page carries the full estate as JSON in `#__NEXT_DATA__` instead of
 * markup. Falls back to the original listing whenever the page or that payload is unavailable.
 *
 * @param {ParsedListing} listing
 * @param {import('puppeteer-core').Browser} [browser]
 * @param {typeof puppeteerExtractor} [extractDetails]
 * @returns {Promise<ParsedListing>}
 */
async function fetchDetails(listing, browser, extractDetails = puppeteerExtractor) {
  try {
    const html = await extractDetails(listing.link, 'body', { browser, name: 'sparkasse_details' });
    if (!html) return listing;

    const $ = cheerio.load(html);
    const nextDataRaw = $('#__NEXT_DATA__').text();
    if (!nextDataRaw) return listing;

    const estate = JSON.parse(nextDataRaw)?.props?.pageProps?.estate;
    if (!estate) return listing;

    const description = (estate.frontendItems || [])
      .map((item) => {
        const texts = contentsOfType(item, 'contentBoxes')
          .filter((d) => d.type === 'text' && d.content)
          .map((d) => d.content);
        if (!texts.length) return null;
        return [item.label, ...texts].filter(Boolean).join('\n');
      })
      .filter(Boolean)
      .join('\n\n');

    const addr = estate.address;
    let address = listing.address;
    if (addr) {
      const street = [addr.street, addr.streetNumber].filter(Boolean).join(' ');
      const cityLine = [addr.zip, addr.city].filter(Boolean).join(' ');
      const full = [street, cityLine].filter(Boolean).join(', ');
      if (full) address = full;
    }

    const attributes = readAttributes(estate);

    return {
      ...listing,
      address,
      description: description || listing.description,
      buildYear: normalizeBuildYear(attributes.constructionYear),
      energyClass: normalizeEnergyClass(attributes.energyEfficiencyClass),
    };
  } catch (error) {
    logger.warn(`Could not fetch Sparkasse detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * The payload rows of one of a frontend item's content blocks. The exposé nests everything two
 * levels deep this way - a block names its type, its `data` carries the rows.
 *
 * @param {any} item one entry of the exposé's `frontendItems`
 * @param {string} type the block type to read, `contentBoxes` or `attributeTable`
 * @returns {any[]}
 */
function contentsOfType(item, type) {
  return (item?.contents || []).filter((content) => content?.type === type).flatMap((content) => content?.data || []);
}

/**
 * Flatten the exposé's attribute tables into one `{name: value}` map. The tables are grouped by
 * headline ("Objektdaten", "Zustand und Energieausweis"), but the names are unique across them.
 *
 * @param {any} estate the exposé's `estate` payload
 * @returns {Record<string, string>}
 */
function readAttributes(estate) {
  const entries = (estate?.frontendItems || [])
    .flatMap((item) => contentsOfType(item, 'attributeTable'))
    .filter((attribute) => attribute?.name && attribute?.value != null)
    .map((attribute) => [attribute.name, attribute.value]);

  return Object.fromEntries(entries);
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o, runUrl) {
  const originalId = o.id.split('/').pop().replace('.html', '');
  const id = buildHash(originalId, o.price);
  const link = o.link != null ? `https://immobilien.sparkasse.de${o.link}` : runUrl;

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
  crawlContainer: '[data-id="estate-list-item"]',
  sortByDateParam: 'sortBy=date_desc',
  waitForSelector: 'body',
  crawlFields: {
    id: 'a@href',
    title: 'h3 | trim',
    price: '.estate-list-price | trim',
    size: '.estate-mainfact:nth-child(1) span | trim',
    rooms: '.estate-mainfact:nth-child(2) span | trim',
    address: 'h6 | trim',
    image: 'img@src',
    link: 'a@href',
  },
  normalize: normalize,
  fetchDetails,
  activityProbe: (url) => checkIfListingIsActive(url, 'Angebot nicht gefunden'),
  priceTracking: {
    /**
     * `estate.priceNumeric` is the already-parsed figure behind the `.estate-list-price` the search
     * list reads, so the two agree without any string handling in between.
     *
     * @param {string} html
     * @returns {number|null}
     */
    extract: (html) => readNextData(html)?.props?.pageProps?.estate?.priceNumeric ?? null,
    waitForSelector: 'body',
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
  // The run's search URL is bound here rather than read from the module-level `config`:
  // that object's `url` is null on the static template and `createConfig` returns a copy,
  // so the module binding is never assigned. Reading it produced a fallback URL for every
  // job regardless of what the user configured.
  normalize: (o) => normalize(o, sourceConfig.url),
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});
export const metaInformation = {
  countries: ['de'],
  name: 'Sparkasse Immobilien',
  baseUrl: 'https://immobilien.sparkasse.de/',
  id: 'sparkasse',
};
export { config };
