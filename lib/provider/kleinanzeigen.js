/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import logger from '../services/logger.js';
import * as cheerio from 'cheerio';

let appliedBlackList = [];
let appliedBlacklistedDistricts = [];

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

    const candidateDescription = cleanText(node.description || node?.itemOffered?.description);
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
  };
}

async function enrichListingFromDetails(listing, browser) {
  const absoluteLink = toAbsoluteLink(listing.link);
  if (!absoluteLink) return listing;

  try {
    const html = await puppeteerExtractor(absoluteLink, null, { browser });
    if (!html) return { ...listing, link: absoluteLink };

    const { detailAddress, detailDescription } = extractDetailFromHtml(html);

    return {
      ...listing,
      link: absoluteLink,
      address: detailAddress || listing.address,
      description: detailDescription || listing.description,
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
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const parts = (o.tags || '').split('·').map((p) => p.trim());
  const size = parts.find((p) => p.includes('m²'));
  const rooms = parts.find((p) => p.includes('Zi.'));
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
 * @returns {boolean}
 */
function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  const isBlacklistedDistrict =
    appliedBlacklistedDistricts.length === 0 ? false : isOneOf(o.description, appliedBlacklistedDistricts);
  return o.title != null && !isBlacklistedDistrict && titleNotBlacklisted && descNotBlacklisted;
}

/** @type {ProviderConfig} */
const config = {
  fieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  crawlContainer: '#srchrslt-adtable .ad-listitem ',
  //sort by date is standard oO
  sortByDateParam: null,
  waitForSelector: 'body',
  crawlFields: {
    id: '.aditem@data-adid',
    price: '.aditem-main--middle--price-shipping--price | removeNewline | trim',
    tags: '.aditem-main--middle--tags | removeNewline | trim',
    title: '.aditem-main .text-module-begin a | removeNewline | trim',
    link: '.aditem-main .text-module-begin a@href | removeNewline | trim',
    description: '.aditem-main .aditem-main--middle--description | removeNewline | trim',
    address: '.aditem-main--top--left | trim | removeNewline',
    image: 'img@src',
  },
  fetchDetails,
  normalize: normalize,
  filter: applyBlacklist,
  activeTester: checkIfListingIsActive,
};
export const metaInformation = {
  name: 'Kleinanzeigen',
  baseUrl: 'https://www.kleinanzeigen.de/',
  id: 'kleinanzeigen',
};
export const init = (sourceConfig, blacklist, blacklistedDistricts) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlacklistedDistricts = blacklistedDistricts || [];
  appliedBlackList = blacklist || [];
};
export { config };
