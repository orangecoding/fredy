/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
import { extractNumber } from '../utils/extract-number.js';
import { normalizeBuildYear, normalizeEnergyClass } from '../utils/buildingFacts.js';
import { readNextData } from '../utils/priceExtractors.js';
import { toListingImages } from '../utils/listingImages.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

/**
 * Enrich a listing with the description and the exact address of its expose. The portal is a
 * Next.js app, so the detail page carries the full estate as JSON in `#__NEXT_DATA__` instead of
 * markup. Falls back to the original listing whenever the page or that payload is unavailable.
 *
 * @param {ParsedListing} listing
 * @param {import('puppeteer-core').Browser} [browser]
 * @param {typeof puppeteerExtractor} [extractDetails]
 * @returns {Promise<ParsedListing>}
 */
async function fetchDetails(listing, browser, extractDetails = puppeteerExtractor) {
  try {
    const html = await extractDetails(listing.link, 'body', { browser, name: 'sparkasse_details' });
    const estate = readEstate(html);
    if (!estate) return listing;
    return withExposeDetails(listing, estate);
  } catch (error) {
    logger.warn(`Could not fetch Sparkasse detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * The exposé's `estate` payload out of its `#__NEXT_DATA__`.
 *
 * @param {string|null|undefined} html the rendered exposé
 * @returns {any|null} null when the page or the payload is missing
 * @throws {SyntaxError} when the payload is no JSON
 */
function readEstate(html) {
  if (!html) return null;
  const nextDataRaw = cheerio.load(html)('#__NEXT_DATA__').text();
  if (!nextDataRaw) return null;
  return JSON.parse(nextDataRaw)?.props?.pageProps?.estate ?? null;
}

/**
 * Add what only the exposé states to a listing: the description, the exact address, the
 * construction year and the energy efficiency class.
 *
 * @param {ParsedListing} listing the listing as normalized so far
 * @param {any} estate the exposé's `estate` payload
 * @returns {ParsedListing} the enriched listing
 */
function withExposeDetails(listing, estate) {
  const description = (estate.frontendItems || [])
    .map((item) => {
      const texts = contentsOfType(item, 'contentBoxes')
        .filter((d) => d.type === 'text' && d.content)
        .map((d) => d.content);
      if (!texts.length) return null;
      return [item.label, ...texts].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');

  const addr = estate.address;
  let address = listing.address;
  if (addr) {
    const street = [addr.street, addr.streetNumber].filter(Boolean).join(' ');
    const cityLine = [addr.zip, addr.city].filter(Boolean).join(' ');
    const full = [street, cityLine].filter(Boolean).join(', ');
    if (full) address = full;
  }

  const attributes = readAttributes(estate);

  return {
    ...listing,
    address,
    description: description || listing.description,
    buildYear: normalizeBuildYear(attributes.constructionYear),
    energyClass: normalizeEnergyClass(attributes.energyEfficiencyClass),
  };
}

/** Where an exposé lives, `/expose/FID-F13-394-004.html`. Group 1 is the id a search card's link ends in. */
const EXPOSE_PATH = /^\/expose\/([^/]+)\.html$/;

/**
 * The price as the search card spells it, `"410.000 €"`, which is the text a search run hashes.
 *
 * The card's figure is `priceNumeric` (see the price probe below), so of the exposé's main facts it
 * is the euro one carrying that very number, rather than whichever euro fact happens to come first.
 *
 * @param {any} estate the exposé's `estate` payload
 * @returns {string|null} null when the exposé names no such price
 */
function readListPrice(estate) {
  const facts = Array.isArray(estate?.mainFacts) ? estate.mainFacts : [];
  const fact = facts.find((candidate) => /€/.test(candidate?.value ?? '') && candidate.numeric === estate.priceNumeric);
  return fact?.value ?? null;
}

/**
 * Read one exposé into a complete listing, for a listing the user adds by its URL.
 *
 * Builds the card {@link config}'s `crawlFields` read off a search page out of the exposé's
 * `estate` payload and passes it through {@link normalize}, so the link (`/expose/<id>.html` on the
 * portal) and the hash (that id and the card's price text) come out as a search run produces them.
 * What only the exposé carries is then added the way {@link fetchDetails} adds it, plus the gallery
 * and the coordinates.
 *
 * @param {string} url the pasted URL
 * @param {import('puppeteer-core').Browser} [browser] the browser the caller started for this read
 * @param {typeof puppeteerExtractor} [extractDetails]
 * @returns {Promise<ParsedListing|null>} null for a URL that names no exposé, and for a page that
 *   carries no estate or one without a title
 */
async function fetchListingByUrl(url, browser, extractDetails = puppeteerExtractor) {
  let path;
  let origin;
  try {
    const parsed = new URL(url);
    const exposeId = EXPOSE_PATH.exec(parsed.pathname)?.[1];
    if (exposeId == null) return null;
    // The card's `a@href`, which normalize reads both the id and the link from.
    path = `/expose/${exposeId}.html`;
    origin = parsed.origin;
  } catch {
    return null;
  }

  try {
    const estate = readEstate(await extractDetails(`${origin}${path}`, 'body', { browser, name: 'sparkasse_details' }));
    if (typeof estate?.title !== 'string' || estate.title.trim().length === 0) return null;

    const mainFact = (name) => (estate.mainFacts || []).find((fact) => fact?.name === name)?.value ?? null;
    // Every picture comes in six sizes, from `xs` at 100 px up to `xl` at 1920 px and the original.
    const images = toListingImages(
      (estate.images || []).map((image) => {
        const resources = image?.resources || [];
        return (resources.find((resource) => resource?.size === 'xl') ?? resources[0])?.url;
      }),
    );

    const listing = normalize({
      id: path,
      link: path,
      title: estate.title,
      price: readListPrice(estate),
      size: mainFact('livingSpace'),
      rooms: mainFact('roomNumber'),
      address: estate.address?.city ?? null,
      image: images[0]?.url ?? null,
    });

    return {
      ...withExposeDetails(listing, estate),
      images,
      ...(Number.isFinite(estate.lat) && Number.isFinite(estate.lng)
        ? { latitude: estate.lat, longitude: estate.lng }
        : {}),
    };
  } catch (error) {
    logger.warn(`Could not read Sparkasse exposé '${path}'.`, error?.message || error);
    return null;
  }
}

/**
 * The payload rows of one of a frontend item's content blocks. The exposé nests everything two
 * levels deep this way - a block names its type, its `data` carries the rows.
 *
 * @param {any} item one entry of the exposé's `frontendItems`
 * @param {string} type the block type to read, `contentBoxes` or `attributeTable`
 * @returns {any[]}
 */
function contentsOfType(item, type) {
  return (item?.contents || []).filter((content) => content?.type === type).flatMap((content) => content?.data || []);
}

/**
 * Flatten the exposé's attribute tables into one `{name: value}` map. The tables are grouped by
 * headline ("Objektdaten", "Zustand und Energieausweis"), but the names are unique across them.
 *
 * @param {any} estate the exposé's `estate` payload
 * @returns {Record<string, string>}
 */
function readAttributes(estate) {
  const entries = (estate?.frontendItems || [])
    .flatMap((item) => contentsOfType(item, 'attributeTable'))
    .filter((attribute) => attribute?.name && attribute?.value != null)
    .map((attribute) => [attribute.name, attribute.value]);

  return Object.fromEntries(entries);
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o, runUrl) {
  const originalId = o.id.split('/').pop().replace('.html', '');
  const id = buildHash(originalId, o.price);
  const link = o.link != null ? `https://immobilien.sparkasse.de${o.link}` : runUrl;

  return {
    id,
    link,
    title: o.title || '',
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address: o.address,
    image: o.image,
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
  return titleNotBlacklisted && descNotBlacklisted;
}
/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  crawlContainer: '[data-testid="estate-teaser"]',
  sortByDateParam: 'sortBy=date_desc',
  // ?minPrice=100000&maxPrice=500000
  priceRangeParams: { min: 'minPrice', max: 'maxPrice' },
  waitForSelector: 'body',
  crawlFields: {
    id: 'a@href',
    title: '[data-testid="estate-teaser-title"] | trim',
    price: '[data-testid="estate-teaser-price"] | trim',
    // main facts: "115 m² Wohnfläche", "774 m² Grundstücksfläche", "4 Zimmer"; each one is optional, so match on the label
    size: '[data-testid="estate-teaser-mainfacts"] span:contains("Wohnfläche") | trim',
    rooms: '[data-testid="estate-teaser-mainfacts"] span:contains("Zimmer") | trim',
    address: '[data-testid="estate-teaser-subtitle"] | trim',
    image: 'img@src',
    link: 'a@href',
  },
  normalize: normalize,
  fetchDetails,
  fetchListingByUrl,
  activityProbe: (url) => checkIfListingIsActive(url, 'Angebot nicht gefunden'),
  priceTracking: {
    /**
     * `estate.priceNumeric` is the already-parsed figure behind the `.estate-list-price` the search
     * list reads, so the two agree without any string handling in between.
     *
     * @param {string} html
     * @returns {number|null}
     */
    extract: (html) => readNextData(html)?.props?.pageProps?.estate?.priceNumeric ?? null,
    waitForSelector: 'body',
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
  // The run's search URL is bound here rather than read from the module-level `config`:
  // that object's `url` is null on the static template and `createConfig` returns a copy,
  // so the module binding is never assigned. Reading it produced a fallback URL for every
  // job regardless of what the user configured.
  normalize: (o) => normalize(o, sourceConfig.url),
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});
export const metaInformation = {
  countries: ['de'],
  name: 'Sparkasse Immobilien',
  baseUrl: 'https://immobilien.sparkasse.de/',
  id: 'sparkasse',
};
export { config };
