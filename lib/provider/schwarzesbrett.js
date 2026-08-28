/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import logger from '../services/logger.js';
import { extractBuildingFacts } from '../utils/buildingFacts.js';
import * as cheerio from 'cheerio';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://schwarzesbrett.bremen.de';

/**
 * Turn a relative URL coming from the portal (e.g. "/show/19726" or
 * "/storage/images/...") into an absolute one. Returns null for falsy input.
 * @param {string|null|undefined} link
 * @returns {string|null}
 */
function toAbsoluteLink(link) {
  if (!link) return null;
  return link.startsWith('http') ? link : `${BASE_URL}${link}`;
}

/**
 * Collapse whitespace and strip tags from an arbitrary string.
 * @param {string|null|undefined} value
 * @returns {string}
 */
function cleanText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Read the text rendered next to a FontAwesome icon. The portal renders an icon
 * span (e.g. `<span class="far fa-circle-euro">`) directly followed by a span
 * holding the value, so the adjacent-sibling selector targets that value.
 * @param {import('cheerio').CheerioAPI} $
 * @param {string} iconClass FontAwesome modifier class (e.g. 'fa-circle-euro')
 * @returns {string}
 */
function readIconValue($, iconClass) {
  return cleanText($(`.${iconClass} + span`).first().text());
}

/**
 * Fetch the listing detail page and enrich the (sparse) search-result listing
 * with the full description, the precise district/address, the price and the
 * feature tags rendered on the detail page. Falls back to the original listing
 * when the page cannot be loaded.
 *
 * @param {ParsedListing} listing
 * @param {import('puppeteer-core').Browser} [browser]
 * @returns {Promise<ParsedListing>}
 */
async function fetchDetails(listing, browser) {
  const absoluteLink = toAbsoluteLink(listing.link);
  if (!absoluteLink) return listing;

  try {
    const html = await puppeteerExtractor(absoluteLink, 'body', { browser, name: 'schwarzesbrett_details' });
    if (!html) return { ...listing, link: absoluteLink };

    const $ = cheerio.load(html);

    const description = cleanText($('.trix-content').first().text());

    const features = $('[class*="fa-check"]')
      .map((_, el) => cleanText($(el).parent().text()))
      .get()
      .filter(Boolean);

    const detailAddress = readIconValue($, 'fa-location-pin');
    const detailPrice = readIconValue($, 'fa-circle-euro');

    const enrichedDescription = [description, features.length ? features.join(', ') : null]
      .filter(Boolean)
      .join('\n\n');

    const fullDescription = enrichedDescription || listing.description;

    return {
      ...listing,
      link: absoluteLink,
      address: detailAddress || listing.address,
      price: extractNumber(detailPrice) ?? listing.price,
      description: fullDescription,
      ...extractBuildingFacts(fullDescription),
    };
  } catch (error) {
    logger.warn(`Could not fetch Schwarzes Brett detail page for listing '${listing.id}'.`, error?.message || error);
    return { ...listing, link: absoluteLink };
  }
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o, runUrl) {
  const originalId = (o.id || '').split('/').pop();
  const id = buildHash(originalId, o.price);

  return {
    id,
    title: o.title,
    link: toAbsoluteLink(o.link) || runUrl,
    price: extractNumber(o.price),
    // The bulletin board does not expose size/rooms as structured fields on the
    // search results page; the keys are kept so requiredFieldNames is satisfied.
    size: null,
    rooms: null,
    address: o.address,
    image: toAbsoluteLink(o.image),
    description: o.description,
  };
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList Terms the job wants filtered out.
 * @param {string[]} appliedBlacklistedDistricts Districts the job wants filtered out.
 * @returns {boolean}
 */
function applyBlacklist(o, appliedBlackList, appliedBlacklistedDistricts) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  const isBlacklistedDistrict =
    appliedBlacklistedDistricts.length === 0 ? false : isOneOf(o.address, appliedBlacklistedDistricts);
  return o.title != null && !isBlacklistedDistrict && titleNotBlacklisted && descNotBlacklisted;
}

/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  // the result cards are the only grids stretched to full height, the surrounding
  // grids (filter column, result list, ad slots) do not carry `h-full`
  crawlContainer: '.app-grid.h-full',
  // The portal already sorts by "Datum absteigend" (date descending) by default.
  sortByDateParam: null,
  waitForSelector: 'body',
  crawlFields: {
    id: 'h3 a@href',
    link: 'h3 a@href',
    title: 'h3 a | trim',
    image: 'img@src',
    description: '.trix-content | trim',
    price: '.fa-circle-euro + span | trim',
    address: '.fa-location-pin + span | trim',
  },
  fetchDetails,
  normalize,
  activityProbe: checkIfListingIsActive,
  priceTracking: {
    // The same node `fetchDetails` already reads, and the same selector the search list uses, so
    // parity between the two readings holds by construction rather than by coincidence.
    selector: '.fa-circle-euro + span | trim',
  },
};

export const metaInformation = {
  countries: ['de'],
  name: 'Schwarzes Brett Bremen',
  baseUrl: 'https://schwarzesbrett.bremen.de/',
  id: 'schwarzesbrett',
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
 * @param {string[]} [blacklistedDistricts] Districts to filter listings out by.
 * @returns {ProviderConfig} A configuration usable by a single pipeline run.
 */
export const createConfig = (sourceConfig, blacklist = [], blacklistedDistricts = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  // The run's search URL is bound here rather than read from the module-level `config`:
  // that object's `url` is null on the static template and `createConfig` returns a copy,
  // so the module binding is never assigned. Reading it produced a fallback URL for every
  // job regardless of what the user configured.
  normalize: (o) => normalize(o, sourceConfig.url),
  filter: (listing) => applyBlacklist(listing, blacklist ?? [], blacklistedDistricts ?? []),
});

export { config };
