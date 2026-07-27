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

const BASE_URL = 'https://www.imaxx.de';

/**
 * imaxx runs on the WP-ImmoMakler WordPress plugin, which sprinkles soft hyphens into
 * German compound words ("Objekt&shy;beschreibung"). They have to go before any text match.
 */
const SOFT_HYPHEN = /\u00ad/g;

let appliedBlackList = [];

/**
 * Collapse whitespace and drop soft hyphens so the text can be compared and stored.
 *
 * @param {string|null|undefined} value raw text taken from the page
 * @returns {string|null} the cleaned text or null when there was nothing to clean
 */
function cleanText(value) {
  if (value == null) return null;
  const cleaned = value.replace(SOFT_HYPHEN, '').replace(/\s+/g, ' ').trim();
  return cleaned.length === 0 ? null : cleaned;
}

/**
 * The list page renders the location as "35390 Gießen, Etagenwohnung", the detail page as
 * "35390 Gießen, Etagenwohnung zum Kauf". Everything behind the first comma is the object
 * type, not part of the address, and would only confuse the geocoder.
 *
 * @param {string|null|undefined} value the raw subtitle text
 * @returns {string|null} the postal code plus city or null when unavailable
 */
function parseAddress(value) {
  const cleaned = cleanText(value);
  return cleaned == null ? null : cleanText(cleaned.split(',')[0]);
}

/**
 * Turns a possibly relative url into an absolute one.
 *
 * @param {string|null|undefined} url the url found on the page
 * @returns {string|null} the absolute url or null when it could not be resolved
 */
function toAbsoluteUrl(url) {
  if (!url) return null;
  try {
    return new URL(url, BASE_URL).href;
  } catch {
    return null;
  }
}

/**
 * Finds the body text of the panel whose heading matches the given label. imaxx reuses the
 * same css classes for every panel ("Lage", "Objektbeschreibung", "Ausstattung / Merkmale"),
 * so the heading text is the only reliable discriminator.
 *
 * @param {import('cheerio').CheerioAPI} $ the loaded detail page
 * @param {string} heading the heading to look for (soft hyphens are ignored)
 * @returns {string|null} the panel body text or null when the panel does not exist
 */
function findPanelText($, heading) {
  const panel = $('.panel')
    .filter((_, el) => cleanText($(el).find('.panel-heading h2').first().text()) === heading)
    .first();

  return panel.length === 0 ? null : cleanText(panel.find('.panel-body').first().text());
}

/**
 * Reads the description out of the schema.org product node imaxx renders into the detail page.
 * Used as a last resort when the markup of the description panel changes.
 *
 * @param {import('cheerio').CheerioAPI} $ the loaded detail page
 * @returns {string|null} the description or null when there is none
 */
function descriptionFromJsonLd($) {
  let description = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (description != null) return;
    try {
      const data = JSON.parse($(el).text());
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (node?.description) {
          description = cleanText(String(node.description));
          return;
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });
  return description;
}

/**
 * Enriches a listing with the full exposé text. The search result page only carries the
 * headline, so without this the description stays empty.
 *
 * @param {ParsedListing} listing the listing scraped from the search result page
 * @param {import('puppeteer').Browser} browser the shared browser of the current job run
 * @returns {Promise<ParsedListing>} the enriched listing, or the untouched one on failure
 */
async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, null, { browser, name: 'imaxx_details' });
    if (!html) return listing;

    const $ = cheerio.load(html);

    const description =
      findPanelText($, 'Objektbeschreibung') ||
      findPanelText($, 'Ausstattung / Merkmale') ||
      findPanelText($, 'Lage') ||
      descriptionFromJsonLd($);

    return {
      ...listing,
      address: listing.address || parseAddress($('.property-subtitle').first().text()),
      description: description || listing.description,
    };
  } catch (error) {
    logger.warn(`Could not fetch imaxx detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const link = toAbsoluteUrl(o.link) || BASE_URL;
  return {
    id: buildHash(o.id, o.price),
    link,
    title: cleanText(o.title) || '',
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address: parseAddress(o.address),
    // the carousel lazy loads its images, so the real url may sit in either attribute
    image: toAbsoluteUrl(o.image || o.imageSrc),
    description: cleanText(o.description),
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
  crawlContainer: '.property-container',
  sortByDateParam: 'im_order=datedesc',
  waitForSelector: 'body',
  crawlFields: {
    id: '@id',
    title: '.property-title a | trim',
    link: '.property-title a@href',
    // the label carries the marketing type, so both the buy and the rent variant have to be covered
    price:
      '.property-data--item:has(.property-data--item--bottom:contains("Kaufpreis")) .property-data--item--top, ' +
      '.property-data--item:has(.property-data--item--bottom:contains("Kaltmiete")) .property-data--item--top | trim',
    size: '.property-data--item:has(.property-data--item--bottom:contains("Wohnfläche")) .property-data--item--top | trim',
    rooms: '.property-data--item:has(.property-data--item--bottom:contains("Zimmer")) .property-data--item--top | trim',
    address: '.property-subtitle | trim',
    image: '.property-thumbnail img@data-src',
    imageSrc: '.property-thumbnail img@src',
    // the search result page carries no exposé text at all - it is filled in by fetchDetails
  },
  normalize,
  filter: applyBlacklist,
  fetchDetails,
  activeTester: checkIfListingIsActive,
};

export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};

export const metaInformation = {
  name: 'IMAXX',
  baseUrl: 'https://www.imaxx.de/',
  id: 'imaxx',
};

export { config };
