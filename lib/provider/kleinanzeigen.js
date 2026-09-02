/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import { extractBuildingFacts, normalizeBuildYear } from '../utils/buildingFacts.js';
import { sanitize } from '../utils/priceExtractors.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import logger from '../services/logger.js';
import * as cheerio from 'cheerio';

function toAbsoluteLink(link) {
  if (!link) return null;
  return link.startsWith('http') ? link : `https://www.kleinanzeigen.de${link}`;
}

function cleanText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDescription(value) {
  if (value == null) return '';
  return String(value)
    .replace(/<br[^>]*>/gi, '\n')
    .split(/\r\n?|\n/)
    .map(cleanText)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildAddressFromJsonLd(address) {
  if (!address || typeof address !== 'object') return null;

  const locality = cleanText(address.addressLocality);
  const region = cleanText(address.addressRegion);
  const postalCode = cleanText(address.postalCode);
  const streetAddress = cleanText(address.streetAddress);

  const cityPart = [region, locality].filter(Boolean).join(' - ');
  const tail = [postalCode, cityPart || locality || region].filter(Boolean).join(' ');
  const fullAddress = [streetAddress, tail].filter(Boolean).join(', ');

  return fullAddress || null;
}

function flattenJsonLdNodes(node, acc = []) {
  if (node == null) return acc;

  if (Array.isArray(node)) {
    node.forEach((item) => flattenJsonLdNodes(item, acc));
    return acc;
  }

  if (typeof node !== 'object') return acc;

  acc.push(node);

  if (Array.isArray(node['@graph'])) {
    node['@graph'].forEach((item) => flattenJsonLdNodes(item, acc));
  }

  if (node.mainEntity) {
    flattenJsonLdNodes(node.mainEntity, acc);
  }

  if (node.itemOffered) {
    flattenJsonLdNodes(node.itemOffered, acc);
  }

  return acc;
}

function extractDetailFromHtml(html) {
  const $ = cheerio.load(html);
  const nodes = [];

  // Prefer the rendered postal address block from the detail page because
  // it contains the street line that is missing from list results.
  const streetFromDom = cleanText($('#street-address').first().text());
  const localityFromDom = cleanText($('#viewad-locality').first().text());
  const domAddress = [streetFromDom, localityFromDom].filter(Boolean).join(' ');

  $('script[type="application/ld+json"]').each((_, element) => {
    const content = $(element).text();
    if (!content) return;

    try {
      const parsed = JSON.parse(content);
      flattenJsonLdNodes(parsed, nodes);
    } catch {
      // Ignore broken JSON-LD blocks from ads/trackers and keep trying others.
    }
  });

  let detailAddress = null;
  let detailDescription = null;

  if (domAddress) {
    detailAddress = domAddress;
  }

  for (const node of nodes) {
    const candidateAddress = buildAddressFromJsonLd(
      node.address || node?.itemOffered?.address || node?.offers?.address,
    );
    if (!detailAddress && candidateAddress) {
      detailAddress = candidateAddress;
    }

    const candidateDescription = cleanDescription(node.description || node?.itemOffered?.description);
    if (!detailDescription && candidateDescription) {
      detailDescription = candidateDescription;
    }

    if (detailAddress && detailDescription) {
      break;
    }
  }

  return {
    detailAddress,
    detailDescription,
    ...extractFiguresFromHtml($),
  };
}

/**
 * Reads living space, room count and construction year from the detail page's attribute list.
 *
 * Not every search result carries the `89 m² · 2 Zi.` tag line - sellers who leave the structured
 * fields out of the list view still fill them in on the ad itself - and those listings showed up
 * with "N/A" for both. The list looks like
 * `<li class="addetailslist--detail">Wohnfläche<span class="addetailslist--detail--value">89 m²</span></li>`.
 *
 * @param {import('cheerio').CheerioAPI} $
 * @returns {{detailSize: string|null, detailRooms: string|null, detailBuildYear: string|null}}
 */
function extractFiguresFromHtml($) {
  const figures = {};

  $('.addetailslist--detail').each((_, element) => {
    const entry = $(element);
    const value = cleanText(entry.find('.addetailslist--detail--value').first().text());
    // The label is the element's own text, i.e. everything the value span does not cover.
    const label = cleanText(entry.clone().children().remove().end().text());
    if (label && value) {
      figures[label] = value;
    }
  });

  return {
    detailSize: figures['Wohnfläche'] ?? null,
    detailRooms: figures['Zimmer'] ?? null,
    detailBuildYear: figures['Baujahr'] ?? null,
  };
}

async function enrichListingFromDetails(listing, browser) {
  const absoluteLink = toAbsoluteLink(listing.link);
  if (!absoluteLink) return listing;

  try {
    const html = await puppeteerExtractor(absoluteLink, null, { browser, name: 'kleinanzeigen_details' });
    if (!html) return { ...listing, link: absoluteLink };

    const { detailAddress, detailDescription, detailSize, detailRooms, detailBuildYear } = extractDetailFromHtml(html);

    const description = detailDescription || listing.description;

    return {
      ...listing,
      link: absoluteLink,
      address: detailAddress || listing.address,
      description,
      // Only fills what the tag line on the search result did not provide.
      size: listing.size ?? extractNumber(detailSize),
      rooms: listing.rooms ?? extractNumber(detailRooms),
      buildYear: normalizeBuildYear(detailBuildYear),
      // The attribute list has no energy class; sellers who state one write it into the ad text.
      energyClass: extractBuildingFacts(description).energyClass,
    };
  } catch (error) {
    logger.warn(`Could not fetch Kleinanzeigen detail page for listing '${listing.id}'.`, error?.message || error);
    return { ...listing, link: absoluteLink };
  }
}

async function fetchDetails(listing, browser) {
  return enrichListingFromDetails(listing, browser);
}

/**
 * Reads living space and room count out of a search result's tag line.
 *
 * The line usually reads `89 m² · 2 Zi.`, but the separator is not always there - when the tags
 * come as individual `<span>`s the extracted text collapses to `89 m²2 Zi.`. Splitting on the
 * middle dot then produced a single part matching both units, and the room count came out as the
 * living space. Matching each figure by its unit copes with either shape.
 *
 * @param {string|undefined|null} tags
 * @returns {{size: string|null, rooms: string|null}}
 */
function readTags(tags) {
  const text = tags || '';

  return {
    size: /([\d.,]+)\s*m²/.exec(text)?.[1] ?? null,
    rooms: /([\d.,]+)\s*Zi/i.exec(text)?.[1] ?? null,
  };
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const { size, rooms } = readTags(o.tags);
  const id = buildHash(o.id, o.price);

  return {
    id,
    title: o.title,
    link: toAbsoluteLink(o.link) || o.link,
    price: extractNumber(o.price),
    size: extractNumber(size),
    rooms: extractNumber(rooms),
    address: o.address,
    description: o.description,
    image: o.image,
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
    appliedBlacklistedDistricts.length === 0 ? false : isOneOf(o.description, appliedBlacklistedDistricts);
  return o.title != null && !isBlacklistedDistrict && titleNotBlacklisted && descNotBlacklisted;
}

/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  crawlContainer: '#srchrslt-adtable article[data-adid]',
  //sort by date is standard oO
  sortByDateParam: null,
  waitForSelector: 'body',
  crawlFields: {
    id: '@data-adid',
    price: 'p.text-secondary | removeNewline | trim',
    tags: 'p.font-strong.text-onSurfaceSubdued | removeNewline | trim',
    title: 'h3 | removeNewline | trim',
    link: '@data-href',
    description: 'p.text-bodyRegular | removeNewline | trim',
    address: 'div.text-onSurfaceNonessential > span:first-of-type | trim | removeNewline',
    image: '[data-image-container] img@src',
  },
  fetchDetails,
  normalize: normalize,
  activityProbe: checkIfListingIsActive,
  priceTracking: {
    /**
     * Microdata rather than the rendered price: `content` is machine-readable, while the visible
     * node carries the currency and, for some categories, a "VB" suffix. Kleinanzeigen publishes
     * exactly one price per ad, so there is no Kalt/Warm ambiguity to get wrong here.
     *
     * Read through {@link sanitize} rather than the generic selector path, because the attribute is
     * English-decimal ("1600.00") and the German-format parser behind that path would read it as
     * 160000.
     *
     * @param {string} html
     * @returns {number|null}
     */
    extract: (html) => sanitize(cheerio.load(html)('[itemprop="price"]').attr('content')),
  },
};
export const metaInformation = {
  countries: ['de'],
  name: 'Kleinanzeigen',
  baseUrl: 'https://www.kleinanzeigen.de/',
  id: 'kleinanzeigen',
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
  filter: (listing) => applyBlacklist(listing, blacklist ?? [], blacklistedDistricts ?? []),
});
export { config };
