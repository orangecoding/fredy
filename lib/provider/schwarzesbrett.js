/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import { extractField } from '../services/extractor/parser/parser.js';
import logger from '../services/logger.js';
import { extractBuildingFacts } from '../utils/buildingFacts.js';
import * as cheerio from 'cheerio';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://schwarzesbrett.bremen.de';

/** Where an advert's page lives: `/show/48734`. */
const AD_PATH = /^\/show\/(\d+)\/?$/;

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
 * Add what only the advert's own page carries to a listing: the full text with its feature tags,
 * the district, and the price.
 *
 * Split out of {@link fetchDetails} so {@link fetchListingByUrl}, which has loaded the page already,
 * enriches the same way without asking the portal a second time.
 *
 * @param {ParsedListing} listing
 * @param {import('cheerio').CheerioAPI} $ The advert's page.
 * @returns {ParsedListing}
 */
function mergeDetailPage(listing, $) {
  const description = cleanText($('.trix-content').first().text());

  const features = $('[class*="fa-check"]')
    .map((_, el) => cleanText($(el).parent().text()))
    .get()
    .filter(Boolean);

  const detailAddress = readIconValue($, 'fa-location-pin');
  const detailPrice = readIconValue($, 'fa-circle-euro');

  const enrichedDescription = [description, features.length ? features.join(', ') : null].filter(Boolean).join('\n\n');

  const fullDescription = enrichedDescription || listing.description;

  return {
    ...listing,
    address: detailAddress || listing.address,
    price: extractNumber(detailPrice) ?? listing.price,
    description: fullDescription,
    ...extractBuildingFacts(fullDescription),
  };
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

    return mergeDetailPage({ ...listing, link: absoluteLink }, cheerio.load(html));
  } catch (error) {
    logger.warn(`Could not fetch Schwarzes Brett detail page for listing '${listing.id}'.`, error?.message || error);
    return { ...listing, link: absoluteLink };
  }
}

/**
 * The id of the advert a page shows, or null when it shows none.
 *
 * The portal is a Livewire app, and an advert's page is the component that names itself
 * `advertisements.advertisement-show` and carries the advert's id; a search renders
 * `advertisements.advertisements-index` instead. The extractor hands over the body only, so the
 * `og:url` in the head is out of reach.
 *
 * @param {import('cheerio').CheerioAPI} $ The page.
 * @returns {string|null}
 */
function readShownAdvertId($) {
  for (const element of $('main[wire\\:snapshot]').toArray()) {
    try {
      const snapshot = JSON.parse($(element).attr('wire:snapshot'));
      if (snapshot?.memo?.name === 'advertisements.advertisement-show' && snapshot.data?.id != null) {
        return String(snapshot.data.id);
      }
    } catch {
      // A snapshot that does not parse names no advert.
    }
  }
  return null;
}

/**
 * Read one advert into a complete listing, for a listing the user adds by its URL.
 *
 * Builds the card {@link normalize} reads off a search result from the advert's own page. The page
 * renders the price and the district with the same markup as the card, so the card's own selectors
 * read them, and the hash (ad id and the price text) and the link come out exactly as a search run
 * produces them. The rest is added the way {@link fetchDetails} adds it.
 *
 * @param {string} url The pasted URL.
 * @param {any} [browser] The browser to load the page in.
 * @returns {Promise<ParsedListing|null>} Null for a URL that names no advert, and for a page that is
 *   not the advert it names.
 */
async function fetchListingByUrl(url, browser) {
  let adId;
  try {
    adId = AD_PATH.exec(new URL(url).pathname)?.[1];
  } catch {
    return null;
  }
  if (adId == null) return null;

  try {
    // The card's link, which a search run stores, and the card's id, of which `normalize` keeps
    // the last segment.
    const link = `/show/${adId}`;
    const html = await puppeteerExtractor(toAbsoluteLink(link), 'body', { browser, name: 'schwarzesbrett_details' });
    if (!html) return null;
    const $ = cheerio.load(html);
    if (readShownAdvertId($) !== adId) return null;

    const title = cleanText($('h1').first().text());
    if (!title) return null;

    const listing = normalize({
      id: link,
      link,
      title,
      price: extractField($.root(), config.crawlFields.price),
      address: extractField($.root(), config.crawlFields.address),
      // The slideshow's first picture. The card's thumbnail is a smaller cut of the same one.
      image: $('img[src*="/storage/images/"]').first().attr('src') ?? null,
    });
    return mergeDetailPage(listing, $);
  } catch (error) {
    logger.warn(`Could not read Schwarzes Brett advert '${adId}'.`, error?.message || error);
    return null;
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
  // grids (filter column, result list, ad slots) do not carry `h-full`. The cards
  // dropped the portal's own `app-grid` class for Tailwind's `grid`, while the
  // surrounding grids kept it, so the card selector keys on `grid`.
  crawlContainer: '.grid.h-full',
  // The portal already sorts by "Datum absteigend" (date descending) by default.
  sortByDateParam: null,
  // ?price_filters[min]=500&price_filters[max]=1000 - brackets are part of the parameter name.
  priceRangeParams: { min: 'price_filters[min]', max: 'price_filters[max]' },
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
  fetchListingByUrl,
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
