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
import { normalizeBuildYear, normalizeEnergyClass } from '../utils/buildingFacts.js';
import { convertSearchUrlToRequest } from '../services/immowelt/immowelt-search-model.js';
import { searchClassifieds, fetchExposeHtml } from '../services/immowelt/immoweltBff.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

/**
 * The exposé elements holding the full, unshortened description.
 *
 * The card payload truncates it at 500 characters, which is enough to read but not enough to
 * blacklist on: the terms people filter for ("Tauschwohnung", "WBS", "Zwangsversteigerung") are
 * routinely spelled out further down - and most often in the third block, the one immowelt heads
 * with "Sonstiges" or "Weitere Informationen". Reading only the first two is what made blacklists
 * miss them.
 */
const DESCRIPTION_SELECTORS = [
  '[data-testid="cdp-main-description-expandable-text"]',
  /** The surroundings rather than the flat. */
  '[data-testid="cdp-location-description-expandable-text"]',
  /** Furnishings, commission notes, WBS requirements - everything that has no box of its own. */
  '[data-testid="cdp-additional-description-expandable-text"]',
];

/** The script tag immowelt's micro-frontend shell hands its server state to the page in. */
const SERVER_STATE_MARKER = '__UFRN_LIFECYCLE_SERVERREQUEST__';

/** The `sections` entries carrying a description each, in the order they are shown on the exposé. */
const SERVER_STATE_SECTIONS = ['mainDescription', 'areaDescription', 'extendedInfoDescription'];

/**
 * Read the JSON immowelt's shell embeds the exposé in.
 *
 * The state is a JSON document inside a JavaScript string literal (`JSON.parse("{\"app_cldp\"...")`),
 * so it is read by scanning that literal to its closing quote rather than by a regex: a description
 * containing `");` - a bracketed aside at the end of a sentence is enough - ends a lazy match early
 * and loses the whole payload.
 *
 * @param {string} html the exposé page source
 * @returns {any|null} the parsed server state, or null when the page carries none
 */
function readServerState(html) {
  const marker = html.indexOf(SERVER_STATE_MARKER);
  if (marker < 0) return null;

  const call = html.indexOf('JSON.parse("', marker);
  if (call < 0) return null;

  const start = call + 'JSON.parse("'.length;
  let end = start;
  while (end < html.length && html[end] !== '"') {
    end += html[end] === '\\' ? 2 : 1;
  }
  if (end >= html.length) return null;

  try {
    return JSON.parse(JSON.parse(`"${html.slice(start, end)}"`));
  } catch {
    return null;
  }
}

/**
 * The exposé's classified, the node every section hangs off.
 *
 * @param {string|null|undefined} html the exposé page source
 * @returns {any|null} the classified, or null when the page carries no server state
 */
function readClassified(html) {
  if (!html) return null;
  return readServerState(html)?.app_cldp?.data?.classified ?? null;
}

/**
 * Turn one description block into plain text.
 *
 * The server state spells its line breaks as `<br>` and the exposé renders them, so they have to
 * survive into the stored description - a blacklist term sitting at the start of a line would
 * otherwise be glued to the end of the previous one.
 *
 * @param {string|null|undefined} value one description block, possibly with markup
 * @returns {string} the block as plain text
 */
function toPlainText(value) {
  if (!value) return '';
  return String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[a-z][a-z0-9]*[^>]*>/gi, '')
    .trim();
}

/**
 * Extract the full, multi-section description from an exposé page.
 *
 * The server state is preferred over the rendered markup: it carries the same blocks without the
 * "show more" truncation the page applies, and it survives immowelt renaming a `data-testid`. The
 * DOM selectors stay as the fallback for the day the shell stops embedding its state.
 *
 * @param {string|null|undefined} html the exposé page source
 * @returns {string|null} every description block, blank-line separated, or null when there is none
 */
export function extractExposeDescription(html) {
  return descriptionFrom(html, readClassified(html));
}

/**
 * The body of {@link extractExposeDescription}, for the caller that has already read the
 * classified and would otherwise pay for a second parse of the same page.
 *
 * @param {string|null|undefined} html the exposé page source
 * @param {any} classified the classified read from that same html
 * @returns {string|null} every description block, blank-line separated, or null when there is none
 */
function descriptionFrom(html, classified) {
  if (!html) return null;

  const sections = classified?.sections;
  if (sections != null) {
    // `description.texts` is the headlined form ("Lage", "Weitere Informationen"); the individual
    // sections are the same blocks without the headlines, for the exposés that carry only those.
    const blocks = Array.isArray(sections.description?.texts)
      ? sections.description.texts.map((text) =>
          [toPlainText(text?.headline), toPlainText(text?.text)].filter(Boolean).join('\n'),
        )
      : SERVER_STATE_SECTIONS.map((section) => toPlainText(sections[section]?.description));

    const full = blocks.filter(Boolean).join('\n\n');
    if (full) return full;
  }

  const $ = cheerio.load(html);
  const full = DESCRIPTION_SELECTORS.map((selector) => $(selector).first().text().trim())
    .filter(Boolean)
    .join('\n\n');

  return full || null;
}

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
 * Replace the truncated card description with the exposé's full one, and read the Baujahr and
 * energy efficiency class off it.
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

    const classified = readClassified(html);
    const full = descriptionFrom(html, classified);

    return {
      ...listing,
      ...extractExposeBuildingFacts(classified),
      description: full || listing.description,
    };
  } catch (error) {
    logger.warn(`Could not fetch immowelt exposé for listing '${listing?.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * Baujahr and energy efficiency class, both stated in the exposé's energy section. A listing can
 * carry several certificates; the first one to name a class answers.
 *
 * @param {any} classified the exposé's classified
 * @returns {{buildYear: number|null, energyClass: string|null}}
 */
function extractExposeBuildingFacts(classified) {
  const energy = classified?.sections?.energy;
  const yearOfConstruction = (energy?.features || []).find((feature) => feature?.type === 'yearOfConstruction');
  const rating = (energy?.certificates || [])
    .flatMap((certificate) => certificate?.scales || [])
    .map((scale) => scale?.efficiencyClass?.rating)
    .find((value) => value != null);

  return {
    buildYear: normalizeBuildYear(yearOfConstruction?.value),
    energyClass: normalizeEnergyClass(rating),
  };
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
  countries: ['de'],
  name: 'Immowelt',
  baseUrl: 'https://www.immowelt.de/',
  id: 'immowelt',
};
export { config };
