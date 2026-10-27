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

const BASE_URL = 'https://www.wg-gesucht.de';

/**
 * Where an advert's page lives: `/wg-zimmer-in-Duesseldorf-Oberbilk.14245211.html`, the ad id the one
 * numbered segment. A search is numbered too, `/wg-zimmer-in-Duesseldorf.30.0.1.0.html`, but in four.
 */
const AD_PATH = /^\/[^/.]+\.(\d+)\.html$/;

/**
 * Collapse whitespace the way the `removeNewline | trim` modifiers of the crawl fields do.
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
function cleanText(value) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Add what only the advert's own page carries to a listing: the full text and the street.
 *
 * Split out of {@link fetchDetails} so {@link fetchListingByUrl}, which has loaded the page already,
 * enriches the same way without asking the portal a second time.
 *
 * @param {ParsedListing} listing
 * @param {import('cheerio').CheerioAPI} $ The advert's page.
 * @returns {ParsedListing}
 */
function mergeDetailPage(listing, $) {
  $('#freitext_0 script').remove();
  const description = cleanText($('#freitext_0').text());
  const address = cleanText($('a[href="#map_container"] .section_panel_detail').text());

  const fullDescription = description || listing.description;

  return {
    ...listing,
    address: address || listing.address,
    description: fullDescription,
    ...extractBuildingFacts(fullDescription),
  };
}

async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, null, { browser, name: 'wgGesucht_details' });
    if (!html) return listing;

    return mergeDetailPage(listing, cheerio.load(html));
  } catch (error) {
    logger.warn(`Could not fetch wgGesucht detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * The Gesamtmiete as the exposé states it among its key facts, `"620€"`. See `priceTracking`.
 *
 * @param {import('cheerio').CheerioAPI} $ The advert's page.
 * @returns {string|null}
 */
function readGesamtmiete($) {
  const label = $('.key_fact_detail')
    .filter((_, element) => $(element).text().trim() === 'Gesamtmiete')
    .first();
  const text = label.parent().find('.key_fact_value').first().text().trim();
  return extractNumber(text) > 0 ? text : null;
}

/**
 * The rent spelled the way the search list spells it, `"620 €"`, for the hash.
 *
 * The key fact holds the same figure as `"620€"`, and a hash over that spelling would store the
 * advert a second time when a job run finds it. The marker card the page's map shows renders the
 * advert the way the list does, so its euro figure is read first. Only without a map does the key
 * fact stand in, with the space put back.
 *
 * @param {import('cheerio').CheerioAPI} $ The advert's page.
 * @param {import('cheerio').Cheerio<any>} mapCard The map's marker card for the advert.
 * @returns {string|null}
 */
function readListPrice($, mapCard) {
  const figure = mapCard
    .find('.map_card_details_truncate b')
    .filter((_, element) => $(element).text().includes('€'))
    .last();
  const fromCard = cleanText(figure.text());
  if (fromCard) return fromCard;
  return readGesamtmiete($)?.replace(/\s*€$/, ' €') ?? null;
}

/**
 * Read one advert into a complete listing, for a listing the user adds by its URL.
 *
 * Builds the card {@link normalize} reads off a search result from the advert's own page, so the
 * hash (ad id and the rent as the list spells it, see {@link readListPrice}) and the link come out
 * exactly as a search run produces them. The rest is added the way {@link fetchDetails} adds it.
 *
 * The link is the page's canonical one, which is the card's `href`; a shared link may carry other
 * parameters.
 *
 * @param {string} url The pasted URL.
 * @param {any} [browser] The browser to load the page in.
 * @returns {Promise<ParsedListing|null>} Null for a URL that names no advert, and for a page that is
 *   not the advert it names.
 */
async function fetchListingByUrl(url, browser) {
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const adId = AD_PATH.exec(path)?.[1];
  if (adId == null) return null;

  try {
    const html = await puppeteerExtractor(`${BASE_URL}${path}`, null, { browser, name: 'wgGesucht_details' });
    if (!html) return null;
    const $ = cheerio.load(html);

    const canonical = $('link[rel="canonical"]').attr('href');
    const canonicalPath = canonical ? new URL(canonical, BASE_URL).pathname : null;
    if (canonicalPath == null || AD_PATH.exec(canonicalPath)?.[1] !== adId) return null;

    const heading = $('h1.detailed-view-title');
    const title = cleanText(heading.text());
    if (!title) return null;

    const mapCard = $(`#map_marker_info_${adId}`);
    const listing = normalize({
      id: adId,
      // `normalize` takes the room count off the front of the card's subtitle, "2er WG · ...". The
      // heading's type label, "2er WG (0w,0m,0d,0n)", starts the same way.
      details: heading.find('span[title]').first().attr('title'),
      price: readListPrice($, mapCard),
      size: $('.key_fact_value')
        .filter((_, element) => $(element).text().includes('m²'))
        .first()
        .text(),
      title,
      link: canonicalPath,
      // The marker card shows the list's thumbnail, which `normalize` knows how to enlarge.
      image: mapCard.find('img').first().attr('src') ?? $('meta[property="og:image"]').attr('content') ?? null,
    });
    return mergeDetailPage(listing, $);
  } catch (error) {
    logger.warn(`Could not read wgGesucht advert '${adId}'.`, error?.message || error);
    return null;
  }
}
/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const id = buildHash(o.id, o.price);
  const link = `${BASE_URL}${o.link}`;
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
  fetchListingByUrl,
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
    extract: (html) => readGesamtmiete(cheerio.load(html)),
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
