/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, null, { browser, name: 'immowelt_details' });
    if (!html) return listing;

    const $ = cheerio.load(html);
    const nextDataRaw = $('#__NEXT_DATA__').text();
    if (!nextDataRaw) return listing;

    const classified = JSON.parse(nextDataRaw)?.props?.pageProps?.classified;
    if (!classified) return listing;

    const description = (classified.Texts || [])
      .map((t) => [t.Title, t.Content].filter(Boolean).join('\n'))
      .filter(Boolean)
      .join('\n\n');

    const addr = classified.EstateAddress;
    let address = listing.address;
    if (addr) {
      const street = [addr.Street, addr.HouseNumber].filter(Boolean).join(' ');
      const cityLine = [addr.ZipCode, addr.District || addr.City].filter(Boolean).join(' ');
      const full = [street, cityLine].filter(Boolean).join(', ');
      if (full) address = full;
    }

    return {
      ...listing,
      address,
      description: description || listing.description,
    };
  } catch (error) {
    logger.warn(`Could not fetch immowelt detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const id = buildHash(o.id, o.price);
  return {
    id,
    link: o.link,
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
  crawlContainer:
    'div[data-testid="serp-core-scrollablelistview-testid"]:not(div[data-testid="serp-enlargementlist-testid"] div[data-testid="serp-card-testid"]) div[data-testid="serp-core-classified-card-testid"]',
  sortByDateParam: 'order=DateDesc',
  // waitForSelector is null: extract the full page via page.content() so the
  // Cheerio crawler can search anywhere in the rendered document.
  // preNavigateUrl visits the homepage first to establish a trusted session
  // before hitting the search URL; this prevents CDN-level bot challenges that
  // fire on cold sessions. waitForNetworkIdle (phase 2) then catches React's
  // listing API round-trip that fires well after domcontentloaded.
  waitForSelector: null,
  puppeteerOptions: {
    puppeteerTimeout: 60_000,
    preNavigateUrl: 'https://www.immowelt.de/',
    waitForNetworkIdle: true,
    waitForNetworkIdleTimeout: 60_000,
  },
  crawlFields: {
    id: 'a@href',
    price: 'div[data-testid="cardmfe-price-testid"] | removeNewline | trim',
    size: 'div[data-testid="cardmfe-keyfacts-testid"] div:nth-of-type(3) | removeNewline | trim',
    rooms: 'div[data-testid="cardmfe-keyfacts-testid"] div:nth-of-type(1) | removeNewline | trim',
    title: 'div[data-testid="cardmfe-description-box-text-test-id"] > div:nth-of-type(2)',
    link: 'a@href',
    description: 'div[data-testid="cardmfe-description-text-test-id"] > div:nth-of-type(2) | removeNewline | trim',
    address: 'div[data-testid="cardmfe-description-box-address"] | removeNewline | trim',
    image: 'div[data-testid="cardmfe-picture-box-opacity-layer-test-id"] img@src',
  },
  normalize: normalize,
  fetchDetails: fetchDetails,
  activityProbe: checkIfListingIsActive,
  priceTracking: {
    /**
     * Immowelt's headline price is repeated verbatim in the page title, as in
     * "Haus 532 m² 2474300 € zum Kauf ...". Every visible copy of it sits behind a hashed CSS class
     * (`css-9wpf20`) that changes with each deploy, and the detail page carries no JSON-LD offer, so
     * the title is the only stable surface. It is also the same figure the search card shows -
     * Kaufpreis on a sale, Kaltmiete on a rental - which is what makes the reading comparable.
     *
     * The euro amount has to be picked out by hand: the title leads with the area, so handing the
     * whole string to `extractNumber` would silently record the square metres as the price.
     *
     * @param {string} html
     * @returns {string|null}
     */
    extract: (html) => {
      const $ = cheerio.load(html);
      const title = $('meta[property="og:title"]').attr('content') || $('title').text();
      return title?.match(/([\d.,]+)\s*€/)?.[1] ?? null;
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
  name: 'Immowelt',
  baseUrl: 'https://www.immowelt.de/',
  id: 'immowelt',
};
export { config };
