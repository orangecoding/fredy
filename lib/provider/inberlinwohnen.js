/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import { extractNumber } from '../utils/extract-number.js';
import { load } from 'cheerio';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://inberlinwohnen.de';
const MAX_PAGES = 100;

let appliedBlackList = [];

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {unknown}
 */
function findDetailValue(value, label) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findDetailValue(entry, label);
      if (found != null) return found;
    }
    return null;
  }

  if (value == null || typeof value !== 'object') return null;
  if (value.label === label) return value.value;

  for (const entry of Object.values(value)) {
    const found = findDetailValue(entry, label);
    if (found != null) return found;
  }
  return null;
}

/**
 * @param {string|null|undefined} snapshot
 * @returns {any}
 */
function parseItem(snapshot) {
  try {
    const item = JSON.parse(snapshot)?.data?.item;
    return (Array.isArray(item) ? item[0] : item) || {};
  } catch {
    return {};
  }
}

/**
 * Extract listing snapshots and pagination metadata from a server-rendered page.
 * @param {string} html
 * @returns {{listings: {id:string}[], totalPages:number}}
 */
function parsePage(html) {
  const $ = load(html);
  const listings = [];
  let totalPages = 1;

  $('[wire\\:snapshot]').each((_, element) => {
    const snapshot = $(element).attr('wire:snapshot');
    if (!snapshot) return;

    try {
      const data = JSON.parse(snapshot)?.data;
      if (data?.item != null) listings.push({ id: snapshot });

      const itemIds = Array.isArray(data?.itemIds?.[0]) ? data.itemIds[0] : data?.itemIds;
      const itemsPerPage = Number(data?.itemsPerPage);
      if (Array.isArray(itemIds) && Number.isFinite(itemsPerPage) && itemsPerPage > 0) {
        totalPages = Math.max(totalPages, Math.ceil(itemIds.length / itemsPerPage));
      }
    } catch {
      // Other Livewire components may contain unrelated or incomplete snapshots.
    }
  });

  return { listings, totalPages };
}

/**
 * Fetch every server-rendered result page so new jobs are not limited to page one.
 * @param {string} url
 * @returns {Promise<{id:string}[]>}
 */
async function getListings(url) {
  async function fetchPage(page) {
    const pageUrl = new URL(url);
    if (page > 1) pageUrl.searchParams.set('page', String(page));
    const response = await fetch(pageUrl, { headers: { Accept: 'text/html' } });
    if (!response.ok) throw new Error(`InBerlinWohnen page ${page} returned HTTP ${response.status}.`);
    return parsePage(await response.text());
  }

  const firstPage = await fetchPage(1);
  if (firstPage.totalPages > MAX_PAGES) {
    throw new Error(`InBerlinWohnen returned ${firstPage.totalPages} pages, exceeding the safety limit.`);
  }

  const listings = [...firstPage.listings];
  for (let page = 2; page <= firstPage.totalPages; page++) {
    listings.push(...(await fetchPage(page)).listings);
  }
  return listings;
}

/**
 * @param {any} address
 * @returns {string|null}
 */
function normalizeAddress(address) {
  const value = Array.isArray(address) ? address[0] : address;
  if (value == null || typeof value !== 'object') return null;

  const street = [value.street, value.number].filter(Boolean).join(' ');
  const city = value.zipCode ? `${value.zipCode} Berlin` : null;
  return [street, city, value.district].filter(Boolean).join(', ') || null;
}

/**
 * @param {...unknown} values
 * @returns {string|number|null}
 */
function firstScalarValue(...values) {
  return values.find((value) => typeof value === 'number' || (typeof value === 'string' && value.trim())) ?? null;
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeLink(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return new URL(value, BASE_URL).href;
  } catch {
    return null;
  }
}

/**
 * Follow aggregator redirects and only report definitive gone responses as inactive.
 * @param {string} link
 * @returns {Promise<number>}
 */
async function isListingActive(link) {
  try {
    const response = await fetch(link, { redirect: 'follow' });
    if (response.status === 200) return 1;
    if (response.status === 404 || response.status === 410) return 0;
    return -1;
  } catch {
    return -1;
  }
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const item = parseItem(o.id);
  const originalId = firstScalarValue(item.objectId, item.id);
  const totalRent = firstScalarValue(findDetailValue(item.details, 'Gesamtmiete'), item.rentGross, item.rentNet);
  const company = typeof item.company?.[0]?.name === 'string' ? item.company[0].name.trim() : null;
  const wbs = findDetailValue(item.details, 'WBS');
  const description = [
    company ? `Anbieter: ${company}` : null,
    item.rentNet != null ? `Kaltmiete: ${item.rentNet} €` : null,
    item.extraCosts != null ? `Nebenkosten: ${item.extraCosts} €` : null,
    totalRent != null ? `Gesamtmiete: ${totalRent} €` : null,
    wbs ? `WBS: ${wbs}` : null,
    item.occupationDate ? `Bezugsfertig ab: ${item.occupationDate}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    id: originalId == null ? null : buildHash(String(originalId)),
    link: normalizeLink(item.deeplink),
    title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : null,
    price: extractNumber(totalRent),
    size: extractNumber(firstScalarValue(item.area)),
    rooms: extractNumber(firstScalarValue(item.rooms)),
    address: normalizeAddress(item.address),
    image:
      typeof item.imagePath === 'string' && item.imagePath.trim()
        ? new URL(`/img/${item.imagePath.replace(/^\/+/, '')}?q=90&fit=crop&fm=png&dpr=1`, BASE_URL).href
        : null,
    description: description || undefined,
  };
}

/**
 * @param {ParsedListing} o
 * @returns {boolean}
 */
function applyBlacklist(o) {
  return !isOneOf(o.title, appliedBlackList) && !isOneOf(o.description, appliedBlackList);
}

/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  crawlContainer: '[wire\\:snapshot*=\'"item":\']',
  sortByDateParam: null,
  waitForSelector: 'body',
  crawlFields: {
    id: '@wire:snapshot',
  },
  normalize,
  filter: applyBlacklist,
  activeTester: isListingActive,
  getListings,
};

export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};

export const metaInformation = {
  name: 'InBerlinWohnen',
  baseUrl: `${BASE_URL}/`,
  id: 'inberlinwohnen',
};

export { config };
