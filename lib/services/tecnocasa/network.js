/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The estate agency networks of the Tecnocasa group, which share one website platform.
 *
 * Tecnocasa and Tecnorete are separate brands with separate agencies and separate adverts, but
 * their sites are the same application on the same media CDN, down to the names of the JSON
 * payloads. This module is the platform; a provider is a brand plus its base url.
 *
 * Every page is server rendered around a Vue application, and each component is handed its data as
 * a JSON attribute rather than as markup: the search page carries a page of adverts on
 * `<estates-index :estates>` and how the results are spread on `:pagination`, an advert's own page
 * carries the whole record on `<estate-show-v... :estate>`. Both are read instead of the rendered
 * cards, which spell the figures as display strings and carry neither the description nor the
 * coordinates.
 *
 * A plain request is enough - the sites put nothing in the way of one - so no browser is launched
 * for any call.
 */

import * as cheerio from 'cheerio';
import { buildHash, isOneOf, sleep } from '../../utils.js';
import checkIfListingIsActive from '../listings/listingActiveTester.js';
import { extractNumber } from '../../utils/extract-number.js';
import { toPlainText } from '../../utils/plain-text.js';
import { sanitize } from '../../utils/priceExtractors.js';
import logger from '../logger.js';
/** @import { ParsedListing } from '../../types/listing.js' */
/** @import { ProviderConfig } from '../../types/providerConfig.js' */

/**
 * A browser's user agent. The platform serves the same document either way, but a request without
 * one is the obvious thing to rate limit first.
 */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const REQUEST_HEADERS = { 'User-Agent': USER_AGENT, 'Accept-Language': 'it-IT,it;q=0.9' };

/**
 * How many result pages one run reads.
 *
 * The platform serves fifteen adverts a page and offers no ordering to put the new ones first, so
 * the cap is what a run can find at all rather than how deep it bothers to look. A search over a
 * whole province runs to a hundred pages and more, which is what the cap is for.
 */
const MAX_PAGES = 40;

/** How long to wait between two result pages, jittered so the gaps are not identical. */
const PAGE_DELAY_MS = 600;
const PAGE_JITTER_MS = 400;

/**
 * Read a bound JSON property off the first component that carries it.
 *
 * Components are looked up by the property rather than by their element name, because the name
 * carries a version the platform bumps on its own schedule - the advert page is on `estate-show-v1`
 * today. `tagPrefix` keeps that from matching a neighbour that happens to be handed the same
 * object: an advert page passes its record to the sticky bottom bar as well.
 *
 * Cheerio decodes the entities the attribute is escaped with, so what comes back out is the JSON
 * that went in.
 *
 * A page carrying two of these - a search page is asked for its adverts and for its pagination -
 * is parsed by the caller once and handed over as a document, so a walk over forty result pages
 * parses forty of them rather than eighty.
 *
 * @param {string|import('cheerio').CheerioAPI|null|undefined} page the raw html of a page, or a
 *   document already loaded from it
 * @param {string} attribute the bound property, e.g. `:estates`
 * @param {string} [tagPrefix] element names the component may have, e.g. `estate-show`
 * @returns {any|null} the parsed value, or null when the page carries no such component
 */
export function readComponentData(page, attribute, tagPrefix) {
  if (!page) return null;

  const $ = typeof page === 'string' ? cheerio.load(page) : page;
  const component = $(`[\\${attribute}]`)
    .filter((_, element) => tagPrefix == null || String(element.tagName).startsWith(tagPrefix))
    .first();

  const raw = component.attr(attribute);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    logger.error(`Could not parse ${attribute} of a tecnocasa group page.`, error?.message || error);
    return null;
  }
}

/**
 * Address the nth result page of a search.
 *
 * The page number is a path segment rather than a query parameter, which is what makes this the
 * one thing the reader has to know about a url. Everything that says *what* is being searched - the
 * town or the area in the path, the contract, the sector, and every filter the form sets, down to
 * the viewport and the polygon a map search draws - is left exactly as it was pasted, so a shape
 * this module has never seen still reads correctly.
 *
 * The page carries a `pages_uri` map that numbers the pages itself, but only for a window of seven
 * around the current one, so a walk past the seventh page has to build the url anyway.
 *
 * Both a `/pag-N` already on the url and a trailing slash are dropped first: a job may well be
 * saved with the second page of a search pasted into it, and the site answers `…/erbusco.html/`
 * while answering `…/erbusco.html//pag-2` with a 404.
 *
 * @param {string} url the search url
 * @param {number} page the result page, one based
 * @returns {string} the url of that page
 */
export function pageUrl(url, page) {
  const parsed = new URL(url);
  // The fragment is the page's own anchor (`#seo-hub`), never part of the search.
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/(?:\/pag-\d+)?\/*$/, '');
  if (page > 1) parsed.pathname += `/pag-${page}`;
  return parsed.href;
}

/**
 * Read one result page.
 *
 * @param {string} url the url of the page
 * @returns {Promise<{estates: any[], totalPages: number}|null>} the adverts of the page and how
 *   many pages the search has, or null when the page carries no search at all
 */
async function readPage(url) {
  const response = await fetch(url, { headers: REQUEST_HEADERS });

  if (!response.ok) {
    logger.error(`Error fetching data from the tecnocasa group: ${response.status} ${response.statusText}`);
    return null;
  }

  // Both components live in the same document, so it is parsed here rather than once per read.
  const document = cheerio.load(await response.text());
  const estates = readComponentData(document, ':estates');
  if (!Array.isArray(estates)) return null;

  const totalPages = readComponentData(document, ':pagination')?.total_pages;
  return { estates, totalPages: Number.isFinite(totalPages) ? totalPages : 1 };
}

/**
 * Read every result page of a search.
 *
 * The platform offers the sort in its own interface but its server ignores the parameter it sets:
 * every search comes back in the same order whichever way it is asked for, with the agencies'
 * promoted adverts first. A new advert therefore lands wherever it lands, and the only way to find
 * one is to read the search out to its end.
 *
 * @param {string} network the brand, for the log
 * @param {string} url the search url
 * @returns {Promise<any[]>} the adverts of the search
 */
async function getListings(network, url) {
  /** @type {any[]} */
  const estates = [];
  const seen = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (page > 1) await sleep(PAGE_DELAY_MS + Math.random() * PAGE_JITTER_MS);

    const answer = await readPage(pageUrl(url, page));
    if (answer == null) {
      if (page === 1) {
        logger.error(`${network} returned a page without adverts. The search URL may be wrong.`);
      }
      break;
    }

    const fresh = answer.estates.filter((estate) => estate?.id != null && !seen.has(estate.id));
    for (const estate of fresh) seen.add(estate.id);
    estates.push(...fresh);

    // A page that repeats the one before it is the search served over again, which is what a page
    // past the last one comes back as.
    if (fresh.length === 0) break;

    if (page >= Math.min(answer.totalPages, MAX_PAGES)) {
      if (answer.totalPages > MAX_PAGES) {
        logger.warn(`${network}: stopped after ${MAX_PAGES} pages. Narrow the search to see the rest.`);
      }
      break;
    }
  }

  return estates;
}

/**
 * Turn a price as the platform writes it into a number.
 *
 * The strings are "€ 170.000" to buy and "€ 1.100 / mese" to rent, and an advert whose owner asked
 * for the figure to stay off the site says "Trattativa riservata" instead. Everything that is not a
 * digit or a separator goes first, because {@link extractNumber} parses from the front of the
 * string and gives up on the euro sign.
 *
 * @param {string|null|undefined} price the price as shown on the card
 * @returns {number|null} the price, or null when the advert names none
 */
function readPrice(price) {
  if (price == null) return null;
  return extractNumber(String(price).replace(/[^\d.,]/g, ''));
}

/**
 * Build the address the geocoder is given.
 *
 * The card writes one string, in one of three shapes: "Roma, Via Casilina - Casilina" is the town,
 * the street, and the quarter the agency files the street under; "Erbusco, Via Iseo" leaves the
 * quarter off; and "Brescia - Mompiano" is a town and a quarter with no street at all, which is
 * what an advert whose owner does not want the address published comes back as.
 *
 * Nominatim answers a line carrying the quarter with nothing, so it goes first - from whichever
 * half it is hanging off - and what is left is turned around into the order an address is written
 * in.
 *
 * @param {string|null|undefined} subtitle the card's subtitle
 * @returns {string|null} the address, or null when the card names no place
 */
function buildAddress(subtitle) {
  if (!subtitle) return null;

  const [city, ...rest] = String(subtitle).split(' - ')[0].split(',');
  const street = rest.join(',').replace(/\s+/g, ' ').trim();
  const town = city.replace(/\s+/g, ' ').trim();

  const address = [street, town].filter((part) => part.length > 0).join(', ');
  return address.length > 0 ? address : null;
}

/**
 * @param {any} o one advert of the search payload
 * @returns {ParsedListing}
 */
export function normalize(o) {
  const price = readPrice(o?.price);

  return {
    id: buildHash(String(o?.id ?? ''), price == null ? null : String(price)),
    title: o?.title,
    link: o?.detail_url,
    price,
    // "75 Mq" on the card, never a number.
    size: extractNumber(o?.surface),
    // "3 locali", and "5 locali" is the upper band rather than exactly five.
    rooms: extractNumber(o?.rooms),
    address: buildAddress(o?.subtitle),
    // The card carries six cuts of the same photo; `card` is the one the search page itself shows.
    image: o?.images?.[0]?.url?.card ?? o?.images?.[0]?.url?.gallery,
    description: undefined,
  };
}

/**
 * The wall-clock format the platform stamps an advert with, "2026-04-14 10:50:40".
 * @type {RegExp}
 */
const PUBLISHED_AT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

/**
 * Turn an advert's own timestamp into epoch milliseconds.
 *
 * The detail payload names it `last_published_at` - the date the agency published or last edited
 * the advert, which is the closest thing to a listing date the platform has. The search pages
 * carry no date anywhere, so this is the one place it can be read from. The string is a wall clock
 * in the agency's timezone; it is read as UTC, since an hour's drift does not matter to a date that
 * answers "how old is this advert".
 *
 * @param {string|null|undefined} value the timestamp as stored
 * @returns {number|undefined} epoch milliseconds, or undefined when there is no readable date
 */
function publishedAt(value) {
  const match = typeof value === 'string' ? value.match(PUBLISHED_AT) : null;
  if (match == null) return undefined;
  const [, y, m, d, h, min, s] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), Number(s));
}

/**
 * Enrich a listing with what only its own page holds.
 *
 * The card has no description at all, so without this the blacklist has nothing but the title to
 * work on - and every title in a search reads "Trilocale in vendita". The page also names the
 * street on its own and carries the coordinates, which spares the listing a geocode.
 *
 * @param {string} network the brand, for the log
 * @param {ParsedListing} listing the listing scraped from the search page
 * @returns {Promise<ParsedListing>} the enriched listing, or the untouched one on failure
 */
async function fetchDetails(network, listing) {
  try {
    const response = await fetch(listing.link, { headers: REQUEST_HEADERS });
    if (!response.ok) {
      logger.warn(`Could not fetch ${network} advert '${listing.id}': ${response.status} ${response.statusText}`);
      return listing;
    }

    const estate = readComponentData(await response.text(), ':estate', 'estate-show');
    if (estate == null) return listing;

    const address = [estate.address, estate.city?.title].filter(Boolean).join(', ');
    const date = publishedAt(estate.last_published_at);

    return {
      ...listing,
      address: address.length > 0 ? address : listing.address,
      // The shared reader answers with an empty string where this stores nothing at all.
      description: toPlainText(estate.description) || listing.description,
      latitude: typeof estate.latitude === 'number' ? estate.latitude : listing.latitude,
      longitude: typeof estate.longitude === 'number' ? estate.longitude : listing.longitude,
      ...(date !== undefined ? { publishedAt: date } : {}),
    };
  } catch (error) {
    logger.warn(`Could not fetch ${network} advert '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * Read the current price off an advert's own page.
 *
 * `numeric_price` is the figure the card's "€ 170.000" is formatted from, so the probe and the
 * scraper always report the same number - which is what keeps a listing from logging a price change
 * the first time it is checked.
 *
 * @param {string} html the raw html of an advert page
 * @returns {number|null} the price, or null when the page carries none
 */
export function extractPrice(html) {
  return sanitize(readComponentData(html, ':estate', 'estate-show')?.numeric_price);
}

/**
 * Read the price from the HTTP response before Vue removes the bound estate data.
 * @param {string} network The brand, for the log.
 * @param {{id: string, link: string}} listing The listing to check.
 * @returns {Promise<number|null>} The current price, or null when unavailable.
 */
async function probePrice(network, listing) {
  try {
    const response = await fetch(listing.link, { headers: REQUEST_HEADERS });
    if (!response.ok) {
      logger.warn(`Could not read ${network} price for '${listing.id}': ${response.status} ${response.statusText}`);
      return null;
    }
    return extractPrice(await response.text());
  } catch (error) {
    logger.warn(`Could not read ${network} price for '${listing.id}'.`, error?.message || error);
    return null;
  }
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList Terms the job wants filtered out.
 * @returns {boolean}
 */
export function applyBlacklist(o, appliedBlackList) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return o.title != null && titleNotBlacklisted && descNotBlacklisted;
}

/**
 * Build the static provider template for one brand of the group.
 *
 * @param {string} network the brand, as it is written in a log line
 * @returns {ProviderConfig} the template a provider module exports as its `config`
 */
export function createNetworkConfig(network) {
  return {
    url: null,
    requiredFieldNames: ['id', 'title', 'link', 'price', 'size', 'rooms', 'address'],
    // The adverts come from the `estates-index` payload rather than from the cards, so there is
    // nothing to crawl.
    crawlContainer: null,
    crawlFields: {},
    // The server ignores the ordering its own interface offers, so there is nothing to send and
    // the walk reads the search out to its end instead.
    sortByDateParam: null,
    // ?min_price=500&max_price=1000 - the query the search form writes on both networks' sites.
    priceRangeParams: { min: 'min_price', max: 'max_price' },
    // The detail pages are plain requests, so the pipeline is what paces them - at the same gait
    // the page walk below keeps. Without it a catch-up run of forty new adverts fired forty detail
    // requests as fast as the network allowed, and the host refused the whole batch.
    detailFetchDelayMs: PAGE_DELAY_MS,
    detailFetchJitterMs: PAGE_JITTER_MS,
    getListings: (url) => getListings(network, url),
    normalize,
    fetchDetails: (listing) => fetchDetails(network, listing),
    activityProbe: checkIfListingIsActive,
    priceTracking: {
      probe: (listing) => probePrice(network, listing),
    },
  };
}
