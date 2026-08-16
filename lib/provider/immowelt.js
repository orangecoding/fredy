/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Immowelt provider, reading listings from the same JSON API the website's own result page uses.
 *
 * Immowelt's result page stopped rendering listings server side: it is a micro-frontend that posts
 * the search to `/serp-bff/search` and asks `/classifiedList/{ids}` for the cards. Scraping the
 * rendered markup meant depending on `data-testid` attributes and hashed CSS classes that change
 * with every deploy, and it meant one full page navigation per listing to reach the description -
 * navigations that DataDome scores far harder than XHRs, and that were the bulk of Fredy's request
 * volume against immowelt.
 *
 * Reading the API instead needs exactly one navigation per job run (the warm-up that earns the
 * DataDome cookie, see `immoweltBff.js`), and hands back numbers instead of strings that have to be
 * parsed back out of German-formatted markup.
 *
 * Hashes changed with this switch. The old listing id was built from the card's `href`, which
 * carried the job's own search string as a query parameter; the id is now the classified id
 * immowelt itself uses. Listings already stored under the old scheme therefore count as new once,
 * which costs every immowelt job a single duplicate notification round on the first run after the
 * upgrade and nothing afterwards.
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import { convertSearchUrlToRequest } from '../services/immowelt/immowelt-search-model.js';
import { searchClassifieds, fetchExposeHtml } from '../services/immowelt/immoweltBff.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

/**
 * The exposé element holding the full, unshortened description.
 *
 * The card payload truncates it at 500 characters, which is enough to read but not enough to
 * blacklist on: the terms people filter for ("Tauschwohnung", "WBS", "Zwangsversteigerung") are
 * routinely spelled out further down.
 */
const DESCRIPTION_SELECTOR = '[data-testid="cdp-main-description-expandable-text"]';

/** The exposé's location paragraph, which describes the surroundings rather than the flat. */
const LOCATION_DESCRIPTION_SELECTOR = '[data-testid="cdp-location-description-expandable-text"]';

/**
 * Fetch one page of listings through immowelt's search BFF.
 *
 * @param {string} url the job's search url, already sorted by date via `sortByDateParam`
 * @param {import('puppeteer').Browser} browser the shared browser of the current job run
 * @returns {Promise<any[]>} the raw classifieds of the first result page
 */
async function getListings(url, browser) {
  return searchClassifieds(browser, convertSearchUrlToRequest(url));
}

/**
 * Replace the truncated card description with the exposé's full one.
 *
 * The card payload already carries everything else Fredy needs - address, prices, key facts,
 * images - so this is the only reason to touch the exposé at all, and it stays behind the
 * `provider_details` opt-in.
 *
 * @param {ParsedListing} listing the listing built from the card payload
 * @param {import('puppeteer').Browser} browser the shared browser of the current job run
 * @returns {Promise<ParsedListing>} the enriched listing, or the untouched one on failure
 */
async function fetchDetails(listing, browser) {
  try {
    const html = await fetchExposeHtml(browser, listing.link);
    if (!html) return listing;

    const $ = cheerio.load(html);
    const description = $(DESCRIPTION_SELECTOR).first().text().trim();
    const locationDescription = $(LOCATION_DESCRIPTION_SELECTOR).first().text().trim();

    const full = [description, locationDescription].filter(Boolean).join('\n\n');
    if (!full) return listing;

    return { ...listing, description: full };
  } catch (error) {
    logger.warn(`Could not fetch immowelt exposé for listing '${listing?.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * Read one of the card's key facts.
 *
 * `splitValue` is the bare figure ("72,4") next to the rendered one ("72,4 m²"), so it survives
 * immowelt changing the unit's spelling.
 *
 * @param {any} classified a raw classified from `/classifiedList`
 * @param {string} type the fact's type, e.g. `numberOfRooms` or `livingSpace`
 * @returns {string|null} the raw figure or null when the listing does not state it
 */
function readFact(classified, type) {
  const fact = (classified?.hardFacts?.facts || []).find((entry) => entry?.type === type);
  return fact?.splitValue ?? fact?.value ?? null;
}

/**
 * Build the address line.
 *
 * Street and house number are only present when the advertiser published them; most listings stop
 * at district and postcode. The city from the tracking payload is appended in that case because
 * immowelt's `city` is the *borough* for the big cities ("Mitte", "Spandau"), and geocoding a
 * borough without its city lands anywhere in Germany that happens to share the name.
 *
 * @param {any} classified a raw classified from `/classifiedList`
 * @returns {string} a geocodable address, or a marker when the listing carries none
 */
function buildAddress(classified) {
  const address = classified?.location?.address ?? {};
  const street = [address.street, address.houseNumber].filter(Boolean).join(' ');
  const locality = [address.zipCode, address.district || address.city].filter(Boolean).join(' ');

  const city = classified?.tracking?.city;
  const withCity =
    city && city !== address.district && city !== address.city ? [locality, city].filter(Boolean).join(', ') : locality;

  const full = [street, withCity].filter(Boolean).join(', ');
  return full || 'NO ADDRESS FOUND';
}

/**
 * @param {any} o a raw classified from `/classifiedList`
 * @returns {ParsedListing}
 */
function normalize(o) {
  // The headline figure, exactly as the result card shows it: Kaltmiete on a rental, Kaufpreis on
  // a sale. `rawData.price` looks like the same number but is not - on listings where immowelt
  // estimates a warm rent it carries that estimate instead (1454.6 against a 1.250 € Kaltmiete),
  // which would report a fabricated increase on the first price probe for exactly those listings.
  const price = o?.hardFacts?.price?.value ?? null;

  const rooms = readFact(o, 'numberOfRooms') ?? o?.rawData?.nbroom ?? null;
  const size = readFact(o, 'livingSpace') ?? o?.rawData?.surface?.main ?? null;

  return {
    id: buildHash(o?.id, price),
    link: o?.url,
    // `hardFacts.title` is the generic category ("Wohnung zur Miete"); the headline is the text the
    // advertiser wrote and the one the card shows in bold.
    title: (o?.mainDescription?.headline || o?.hardFacts?.title || '').trim(),
    price: extractNumber(price),
    size: extractNumber(size),
    rooms: extractNumber(rooms),
    address: buildAddress(o),
    image: o?.gallery?.images?.[0]?.url ?? null,
    description: o?.mainDescription?.description ?? null,
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
  // Kept as documentation of where each field comes from now that nothing is scraped out of
  // markup. `getListings` bypasses the crawl container entirely.
  crawlFields: {
    id: 'id',
    title: 'mainDescription.headline',
    price: 'hardFacts.price.value',
    size: 'hardFacts.facts[livingSpace].splitValue',
    rooms: 'hardFacts.facts[numberOfRooms].splitValue',
    link: 'url',
    address: 'location.address',
    image: 'gallery.images[0].url',
    description: 'mainDescription.description',
  },
  sortByDateParam: 'order=DateDesc',
  normalize: normalize,
  getListings: getListings,
  fetchDetails: fetchDetails,
  activityProbe: checkIfListingIsActive,
  priceTracking: {
    /**
     * Immowelt's headline price is repeated verbatim in the page title, as in
     * "Haus 532 m² 2474300 € zum Kauf ...". Every visible copy of it sits behind a hashed CSS class
     * that changes with each deploy, and the detail page carries no JSON-LD offer, so the title is
     * the only stable surface. It is also the same figure the card shows - Kaufpreis on a sale,
     * Kaltmiete on a rental - which is what makes the reading comparable to `normalize`.
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
