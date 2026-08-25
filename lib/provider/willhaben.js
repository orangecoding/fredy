/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * willhaben, Austria's largest marketplace and by some distance its largest property portal.
 *
 * The search page is a Next.js application, so every result is already in the document as JSON
 * inside `__NEXT_DATA__`. That is read instead of the rendered markup: the JSON carries the figures
 * as numbers, the description in full, and the coordinates, none of which survive into the cards.
 * It also means no headless browser - a plain request is enough.
 *
 * Each advert holds its data as a flat `attributes` list of name/value pairs rather than as
 * fields, which is why {@link readAttributes} exists.
 */

import * as cheerio from 'cheerio';
import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.willhaben.at/';

/** Where willhaben serves the images named by an advert's `MMO` attribute. */
const IMAGE_CDN = 'https://cache.willhaben.at/mmo/';

/**
 * A browser's user agent. willhaben serves the same document either way, but a request without one
 * is answered more slowly and is the obvious thing to rate limit first.
 */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * willhaben's ad type for a Neubauprojekt - a development's landing page rather than a flat.
 *
 * Those adverts carry no living area and no room count of their own, their price is the cheapest
 * unit's, and their link opens the project instead of something rentable. The units are separate
 * adverts that appear in the same result list, so dropping the project loses nothing.
 */
const PROJECT_AD_TYPE_ID = 16;

/**
 * Pull the Next.js payload out of a willhaben search page.
 *
 * @param {string} html
 * @returns {Object[]} The adverts, or an empty array when the page carried none.
 */
function readAdverts(html) {
  const payload = cheerio.load(html)('#__NEXT_DATA__').first().text();
  if (!payload) {
    logger.error('willhaben returned a page without __NEXT_DATA__. The search URL may be wrong.');
    return [];
  }

  try {
    const data = JSON.parse(payload);
    return data?.props?.pageProps?.searchResult?.advertSummaryList?.advertSummary ?? [];
  } catch (error) {
    logger.error('Could not parse willhaben __NEXT_DATA__.', error?.message || error);
    return [];
  }
}

/**
 * Flatten one advert's `attributes` list into a plain object.
 *
 * Every value arrives as an array, even the ones that can only ever hold a single entry, so the
 * first element is taken throughout.
 *
 * @param {Object} advert
 * @returns {Object.<string, string>}
 */
function readAttributes(advert) {
  const attributes = advert?.attributes?.attribute ?? [];
  return Object.fromEntries(attributes.map((entry) => [entry.name, entry.values?.[0]]));
}

/**
 * @param {string} url The job's search URL, with the sort parameter already appended.
 * @returns {Promise<Object[]>}
 */
async function getListings(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'de-AT,de;q=0.9' },
  });

  if (!response.ok) {
    logger.error(`Error fetching data from willhaben: ${response.status} ${response.statusText}`);
    return [];
  }

  return readAdverts(await response.text())
    .filter((advert) => advert?.adTypeId !== PROJECT_AD_TYPE_ID)
    .map((advert) => {
      const attributes = readAttributes(advert);
      return {
        id: attributes.ADID ?? String(advert.id ?? ''),
        title: attributes.HEADING ?? advert.description,
        // SEO_URL is relative to /iad/, not to the site root.
        link: attributes.SEO_URL ? `${BASE_URL}iad/${attributes.SEO_URL}` : null,
        price: attributes.PRICE,
        // The living area is the one to filter on. `ESTATE_SIZE` also counts the balcony for some
        // categories, so it is only a fallback for adverts that leave the living area out.
        size: attributes['ESTATE_SIZE/LIVING_AREA'] ?? attributes.ESTATE_SIZE,
        rooms: attributes.NUMBER_OF_ROOMS,
        postcode: attributes.POSTCODE,
        location: attributes.LOCATION,
        description: attributes.BODY_DYN,
        image: attributes.MMO ? `${IMAGE_CDN}${attributes.MMO}` : null,
      };
    });
}

/**
 * Vienna's numbered districts, as willhaben writes them into `LOCATION`: "03. Bezirk".
 *
 * Dropped rather than kept, because Nominatim cannot resolve them. "1030 Wien, 03. Bezirk,
 * Landstraße" comes back empty; the same address without that one segment resolves to the street.
 * The postcode already carries the district anyway - the 3rd is exactly 1030.
 */
const VIENNA_DISTRICT = /^\d+\.\s*bezirk$/i;

/**
 * Build the address the geocoder is given.
 *
 * `LOCATION` reads "Wien, 03. Bezirk, Landstraße" - a district and a quarter rather than a street,
 * because willhaben only publishes the exact address on the advert itself. That is enough for the
 * area filter and for a pin on the right neighbourhood, which is all the pipeline asks of it.
 *
 * @param {Object} o
 * @returns {string|null}
 */
function buildAddress(o) {
  const segments = String(o.location ?? '')
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && !VIENNA_DISTRICT.test(segment));

  const postcode = o.postcode == null ? '' : String(o.postcode).trim();
  const place = segments.join(', ');
  const address = [postcode, place].filter((part) => part.length > 0).join(' ');

  return address.length > 0 ? address : null;
}

/**
 * A figure willhaben publishes as `0` when the advertiser never filled it in.
 *
 * `NUMBER_OF_ROOMS` is `0` on exactly those adverts, and willhaben's own cards leave the "Zimmer"
 * teaser off for them rather than claiming a flat with no rooms. Read as a number it would be a
 * value no spec filter can do anything sensible with, so it reads as unknown here too.
 *
 * @param {string|undefined} value
 * @returns {number|null}
 */
function optionalFigure(value) {
  const figure = extractNumber(value);
  return figure === 0 ? null : figure;
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  return {
    id: buildHash(o.id, o.price),
    title: o.title,
    link: o.link,
    price: extractNumber(o.price),
    size: optionalFigure(o.size),
    rooms: optionalFigure(o.rooms),
    address: buildAddress(o),
    description: o.description,
    image: o.image,
  };
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList
 * @returns {boolean}
 */
function applyBlacklist(o, appliedBlackList) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return o.title != null && titleNotBlacklisted && descNotBlacklisted;
}

/** @type {ProviderConfig} */
const config = {
  url: null,
  requiredFieldNames: ['id', 'title', 'link', 'price', 'size', 'rooms', 'address'],
  // The results come from __NEXT_DATA__ rather than the markup, so there is nothing to crawl.
  crawlContainer: null,
  crawlFields: {},
  // willhaben already sorts newest first by default; sending it explicitly means a pasted URL that
  // carries a different sort still gets the order the pipeline expects.
  sortByDateParam: 'sort=1',
  getListings,
  normalize,
  activityProbe: checkIfListingIsActive,
};

export const metaInformation = {
  countries: ['at'],
  name: 'willhaben',
  baseUrl: BASE_URL,
  id: 'willhaben',
};

/**
 * Build a run-scoped provider configuration.
 *
 * @param {{url: string, enabled?: boolean}} sourceConfig
 * @param {string[]} [blacklist]
 * @returns {ProviderConfig}
 */
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});

export { config };
