/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
import { extractBuildingFacts, normalizeBuildYear } from '../utils/buildingFacts.js';
import { toListingImages } from '../utils/listingImages.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.immobilien.de';
const SEARCH_PATH = '/suche';

/**
 * The legacy query parameters, mapped onto the ones the rewritten site reads.
 *
 * immobilien.de moved from a PHP search under `/Wohnen/Suchergebnisse-*.html` to a Next.js one
 * under `/suche`. The old URL still answers with a 200 and still renders results, but every
 * `search.*` parameter is dropped on the way, so a job asking for a flat under 1200 € in Düsseldorf
 * quietly became an unfiltered nationwide crawl. Translating is what keeps the search URLs users
 * saved months ago meaning what they meant when they were saved.
 *
 * @type {Record<string, string>}
 */
const LEGACY_PARAMS = {
  'search._filter': 'kategorie',
  'search.typ': 'typ',
  'search.objektart': 'objektart',
  'search.preis_von': 'preis_von',
  'search.preis_bis': 'preis_bis',
  'search.flaeche_von': 'flaeche_von',
  'search.flaeche_bis': 'flaeche_bis',
  'search.zimmer_von': 'zimmer_von',
  'search.zimmer_bis': 'zimmer_bis',
  'search.umkreis': 'umkreis',
};

/**
 * Rewrite a legacy search URL onto the new one, and leave a current URL alone.
 *
 * `search.wo` is the one parameter with nothing to map onto. It carried internal district ids
 * (`district:2434,2695,…`) and the rewritten search takes a place name or a postcode in `ort`
 * instead, with no way to translate the ids into either. Rather than invent a location, the
 * parameter is dropped and the search runs wider than it used to, which is why the mismatch is
 * logged: a job returning half of Germany should say why once per run rather than look healthy.
 *
 * @param {string} url The URL as configured on the job, after the sort parameter was merged in.
 * @returns {string} A URL the current site understands.
 */
export function toSearchUrl(url) {
  let parsed;
  try {
    // No base: a job's provider url is always absolute, and resolving a malformed one against
    // immobilien.de would turn a typo into a confident request for a page that cannot exist.
    parsed = new URL(url);
  } catch {
    return url;
  }

  const legacy = [...parsed.searchParams.keys()].some((key) => key.startsWith('search.'));
  if (!legacy) {
    return parsed.href;
  }

  const translated = new URL(SEARCH_PATH, parsed.origin);
  for (const [key, value] of parsed.searchParams) {
    if (!key.startsWith('search.')) {
      // The sort parameter and anything else already in the new spelling rides along untouched.
      if (key !== 'sort_col' && key !== 'sort_dir') {
        translated.searchParams.set(key, value);
      }
      continue;
    }
    const mapped = LEGACY_PARAMS[key];
    if (mapped) {
      translated.searchParams.set(mapped, value);
    } else if (key === 'search.wo' && value) {
      logger.warn(
        `immobilien.de dropped its district search, so the location filter '${value}' has no equivalent on the rewritten site. This search now runs without it and will return listings outside the area you picked - open the job and paste a fresh search URL to narrow it again.`,
      );
    }
  }
  // `search._filter` is the only source for it on a legacy URL, and without it the search answers
  // for every category rather than the one the job was built for.
  if (!translated.searchParams.has('kategorie')) {
    translated.searchParams.set('kategorie', 'wohnen');
  }
  return translated.href;
}

/**
 * Concatenate the React Server Component payload a Next.js App Router page streams into the
 * document.
 *
 * The page arrives as a series of `self.__next_f.push([1, "<chunk>"])` calls whose chunks are
 * string fragments of one long serialized tree, split at arbitrary points - a single JSON value
 * routinely straddles two of them. Joining every chunk first and reading afterwards is what makes
 * the split irrelevant.
 *
 * @param {string|null|undefined} html Raw page HTML.
 * @returns {string} The concatenated payload, or an empty string when the page carries none.
 */
export function readFlightPayload(html) {
  if (!html) return '';
  let joined = '';
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try {
      joined += JSON.parse(`"${match[1]}"`);
    } catch {
      // A chunk that will not unescape is a chunk we cannot read, but the ones around it are still
      // good - dropping this one costs a fragment, aborting would cost the whole page.
    }
  }
  return joined;
}

/**
 * Take the JSON array or object that starts at `start` out of the payload.
 *
 * The payload is a serialized React tree rather than a JSON document, so there is no parsing it as
 * a whole and no path to index into. What is embedded in it *is* well-formed JSON, though, so the
 * brackets are counted until the value closes and only that slice is handed to `JSON.parse`.
 * Quotes and escapes are tracked because listing titles cheerfully contain `[`, `]` and `"`.
 *
 * @param {string} payload The concatenated flight payload.
 * @param {number} start Index of the opening bracket or brace.
 * @returns {any|null} The parsed value, or null when it never closes or will not parse.
 */
function sliceJsonValue(payload, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < payload.length; index++) {
    const char = payload[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '[' || char === '{') depth++;
    if (char === ']' || char === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(payload.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * The listings a search result page was rendered from.
 *
 * The rewritten site server-renders its cards from a `results` array it also ships in the payload,
 * and reading that array beats reading the cards: the markup is Tailwind utility classes that
 * change with the design, while the array is typed data that additionally carries the coordinates
 * and the construction year the cards never showed.
 *
 * @param {string} html Raw HTML of a search result page.
 * @returns {any[]|null} The raw listings, or null when the page carries no readable payload.
 */
export function parseListings(html) {
  const payload = readFlightPayload(html);
  if (!payload) return null;

  const marker = '"results":[';
  let from = payload.indexOf(marker);
  while (from !== -1) {
    const results = sliceJsonValue(payload, from + marker.length - 1);
    // The page carries more than one `results` array - a "similar searches" block among them - and
    // the listing one is recognisable by its entries rather than by its position.
    if (Array.isArray(results) && results.some((entry) => entry?.legacyId != null || entry?.id != null)) {
      return results.filter((entry) => entry != null && typeof entry === 'object');
    }
    from = payload.indexOf(marker, from + marker.length);
  }
  return null;
}

/**
 * @param {string} url The search URL for this run, with the sort parameter already merged in.
 * @param {import('puppeteer').Browser} browser The shared browser of the current job run.
 * @returns {Promise<any[]>} The raw listings of the first result page.
 */
async function getListings(url, browser) {
  const html = await puppeteerExtractor(toSearchUrl(url), null, { browser, name: 'immobilienDe' });
  const listings = parseListings(html);
  if (listings == null) {
    throw new Error('immobilien.de search page did not contain the expected Next.js payload.');
  }
  return listings;
}

/**
 * Turn the payload's spelling of "absent" into an absent value.
 *
 * React serializes `undefined` as the literal string `"$undefined"`, so an unset construction year
 * arrives as text that is truthy, passes a null check, and reaches the database looking like data.
 *
 * @param {any} value A value read out of the payload.
 * @returns {any} The value, or null when the payload was saying it has none.
 */
function plain(value) {
  return value === '$undefined' || value === undefined ? null : value;
}

/**
 * A coordinate pair, but only when it is one.
 *
 * @param {any} coordinates The `coordinates` object of a raw listing.
 * @returns {{latitude: number, longitude: number}|{}} The pair, or nothing to spread.
 */
function readCoordinates(coordinates) {
  const latitude = Number(coordinates?.lat);
  const longitude = Number(coordinates?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {};
  }
  return { latitude, longitude };
}

/**
 * The exposé's own record.
 *
 * Reading this rather than the page is what keeps the enrichment honest. An exposé ends with a
 * carousel of *other* flats from the same agent, each a full listing object of its own, so any
 * pattern that simply takes the first `"price"` in the payload reports a stranger's figure - the
 * first version of this provider read 458.000 € off a house in Eilenburg while enriching a 395 €
 * room in Düsseldorf. The `expose` key names the one listing the page is about.
 *
 * @param {string} html Raw HTML of an exposé page.
 * @returns {any|null} The exposé object, or null when the page carries no readable payload.
 */
function parseExpose(html) {
  const payload = readFlightPayload(html);
  if (!payload) return null;

  const marker = '"expose":{';
  const at = payload.indexOf(marker);
  return at === -1 ? null : sliceJsonValue(payload, at + marker.length - 1);
}

/**
 * The street address of an exposé.
 *
 * Search cards only ever carry postcode and town, so this is the one place a house number can come
 * from - which is what decides whether the map pin lands on the building or in the middle of the
 * postcode area.
 *
 * @param {any} expose The exposé record.
 * @returns {string|null} e.g. 'Lorettostr. 60, 40219 Düsseldorf', or null when it names none.
 */
function exposeAddress(expose) {
  const address = expose?.address;
  if (address == null) return null;
  const town = [plain(address.plz), plain(address.city)].filter(Boolean).join(' ');
  const parts = [plain(address.street), town].filter((part) => typeof part === 'string' && part.trim().length > 0);
  return parts.length === 0 ? null : parts.join(', ');
}

/**
 * The visible text of an element, with the element boundaries kept as spaces.
 *
 * `.text()` concatenates the text nodes and nothing else, and the exposé's fact table is a run of
 * one-element labels and values, so it comes out as `Etage2Baujahr1966Verfügbar`. Every label in
 * `buildingFacts` is anchored on a word boundary, and there is none between `Baujahr` and `1966`,
 * so the whole table reads as one long word and matches nothing.
 *
 * @param {import('cheerio').Cheerio<any>} element The element to flatten.
 * @returns {string} The text, with a space wherever one element ended and the next began.
 */
function flattenText(element) {
  return element
    .find('*')
    .addBack()
    .contents()
    .filter((_, node) => node.type === 'text')
    .toArray()
    .map((node) => node.data)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The advertisement text of an exposé.
 *
 * Anchored on the section heading rather than on a class name. The description arrives in a div
 * whose classes are Tailwind utilities and will not survive the next restyle, while "Beschreibung
 * der Immobilie" is the label a reader looks for and changes only if the page is rewritten again.
 *
 * @param {import('cheerio').CheerioAPI} $ The loaded exposé page.
 * @returns {string|null} The description, or null when the page has no such section.
 */
function parseExposeDescription($) {
  const heading = $('h2')
    .filter((_, el) => $(el).text().trim() === 'Beschreibung der Immobilie')
    .first();
  if (heading.length === 0) return null;

  const section = heading.closest('section');
  const body = section.length === 0 ? heading.parent() : section;
  const text = body.clone().find('h2').remove().end().text().replace(/\s+/g, ' ').trim();
  return text.length === 0 ? null : text;
}

/**
 * The picture gallery of an exposé, in the order the page shows it.
 *
 * The exposé record does not spell its pictures out - its `images` is a reference into another part
 * of the payload (`"$28:props:children:…"`) - so they are read from the schema.org listing the page
 * renders beside it, which lists the same urls a search card carries, in the same order.
 *
 * @param {import('cheerio').CheerioAPI} $ The loaded exposé page.
 * @returns {string[]} The picture urls, empty when the page states none.
 */
function exposeImages($) {
  for (const block of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data = JSON.parse($(block).text());
      const nodes = Array.isArray(data) ? data : (data?.['@graph'] ?? [data]);
      const listing = (Array.isArray(nodes) ? nodes : []).find((node) =>
        [node?.['@type']].flat().includes('RealEstateListing'),
      );
      if (listing != null) return [listing.image].flat().filter((url) => typeof url === 'string');
    } catch {
      // A malformed block says nothing about the others.
    }
  }
  return [];
}

/**
 * Add what only the exposé knows to a listing: the street, the full advertisement text and the
 * building facts.
 *
 * @param {ParsedListing} listing The listing as read off the search page, or off the exposé's own
 *   record for one added by its URL.
 * @param {import('cheerio').CheerioAPI} $ The loaded exposé page.
 * @param {any} expose The exposé record, see {@link parseExpose}.
 * @returns {ParsedListing} The enriched listing.
 */
function enrichFromExpose(listing, $, expose) {
  const description = parseExposeDescription($) || listing.description;
  // The postcode-and-town the card carried is the fallback, so an exposé that names no street
  // leaves the listing no worse off than it was.
  const address = exposeAddress(expose) || listing.address;

  // Read across the whole exposé body rather than the description alone: the construction year
  // and the energy class are stated in the fact table above the advertisement text, not inside
  // it. Scoped to `.expose-main` because the page ends with other flats from the same agent, and
  // their Baujahr must not be read as this one's.
  const facts = extractBuildingFacts(flattenText($('.expose-main')));

  return {
    ...listing,
    address,
    description,
    // The payload's own year is the fallback, not the loser: spreading the facts blindly wrote a
    // null over a year the search page had already supplied for every exposé whose fact table
    // omits it.
    buildYear: facts.buildYear ?? listing.buildYear ?? null,
    energyClass: facts.energyClass ?? listing.energyClass ?? null,
  };
}

/**
 * Enrich a listing with what only its exposé knows, see {@link enrichFromExpose}.
 *
 * @param {ParsedListing} listing The listing as read off the search page.
 * @param {import('puppeteer').Browser} browser The shared browser of the current job run.
 * @returns {Promise<ParsedListing>} The enriched listing, or the untouched one on failure.
 */
async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, null, { browser, name: 'immobilienDe_details' });
    if (!html) return listing;
    return enrichFromExpose(listing, cheerio.load(html), parseExpose(html));
  } catch (error) {
    logger.warn(`Could not fetch immobilien.de detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * The headline figure of an exposé record.
 *
 * Ordered the way the search card is: a sale states a `kaufpreis`, a letting states its rent, and
 * whichever of the three rent figures the advert quotes is the one the card showed and therefore
 * the one the stored price has to be compared against. Anything else records a drop the day a
 * listing merely started quoting a different figure - and, for a listing added by its URL, hashes
 * it differently from the card a later search finds it on.
 *
 * @param {any} expose The exposé record, see {@link parseExpose}.
 * @returns {number|null} The price, or null when the exposé states none.
 */
function exposePrice(expose) {
  const prices = expose?.prices;
  if (prices == null) return null;

  for (const key of ['kaufpreis', 'kaltmiete', 'nettokaltmiete', 'warmmiete']) {
    const value = Number(plain(prices[key]));
    // A price on request arrives as an absent figure rather than a zero, but a zero would be just
    // as wrong in a history: nothing is ever genuinely advertised for nothing.
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

/**
 * The headline figure of an exposé, for the price history. See {@link exposePrice}.
 *
 * @param {string} html Raw HTML of an exposé page.
 * @returns {number|null} The price, or null when the page states none.
 */
export function readExposePrice(html) {
  return exposePrice(parseExpose(html));
}

/** `/expose/10061004` - the path every search card links to, with the advert's legacy id. */
const EXPOSE_PATH = /^\/expose\/(\d+)\/?$/;

/**
 * Read one exposé into a complete listing, for a listing the user adds by its URL.
 *
 * Builds the card {@link normalize} reads off a search page out of the exposé's own record and
 * passes it through `normalize`, so the link (`/expose/<legacyId>`) and the hash (legacy id and the
 * figure {@link exposePrice} picks, which is the one the card shows) come out exactly as a search
 * run would produce them. What only the exposé carries is then added the way {@link fetchDetails}
 * adds it.
 *
 * @param {string} url The pasted URL.
 * @param {import('puppeteer').Browser} [browser] The browser to render the exposé in.
 * @returns {Promise<ParsedListing|null>} Null for a URL that names no exposé, a page that carries
 *   no exposé record (a bot wall, a removed advert), and an exposé without a title.
 */
async function fetchListingByUrl(url, browser) {
  let legacyId;
  try {
    legacyId = EXPOSE_PATH.exec(new URL(url).pathname)?.[1] ?? null;
  } catch {
    return null;
  }
  if (legacyId == null) return null;

  try {
    // The canonical address rather than the pasted one, which may carry a tracker's parameters.
    const html = await puppeteerExtractor(`${BASE_URL}/expose/${legacyId}`, null, {
      browser,
      name: 'immobilienDe_details',
    });
    const expose = parseExpose(html);
    if (expose == null) {
      logger.debug(`immobilien.de exposé ${legacyId} carried no exposé record.`);
      return null;
    }

    const $ = cheerio.load(html);
    const listing = normalize({
      legacyId,
      title: expose.title,
      price: exposePrice(expose),
      stats: [
        { key: 'area', value: expose.area?.value },
        { key: 'rooms', value: expose.rooms },
      ],
      address: exposeAddress(expose),
      images: exposeImages($),
      description: expose.description,
      yearBuilt: expose.building?.baujahr,
      coordinates: expose.coordinates,
    });
    if (listing.title.trim() === '') return null;

    return enrichFromExpose(listing, $, expose);
  } catch (error) {
    logger.warn(`Could not read immobilien.de exposé ${legacyId}.`, error?.message || error);
    return null;
  }
}

/**
 * One of the figures a search card lists under its title.
 *
 * The card keeps them as labelled entries - `[{key: 'area', value: 52}, {key: 'rooms', value: 2}]` -
 * rather than as fields of their own, so they are looked up by label.
 *
 * @param {any} o The raw listing.
 * @param {string} key The label, e.g. `area`.
 * @returns {any} The value, or null when the card lists no such figure.
 */
function stat(o, key) {
  const entry = Array.isArray(o.stats) ? o.stats.find((candidate) => candidate?.key === key) : null;
  return plain(entry?.value) ?? null;
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const id = plain(o.legacyId) ?? plain(o.id);
  const link = id == null ? BASE_URL : `${BASE_URL}/expose/${id}`;
  const price = o.priceOnRequest ? null : extractNumber(plain(o.price));
  return {
    id: buildHash(String(id ?? ''), price == null ? null : String(price)),
    link,
    title: plain(o.title) || '',
    price,
    size: extractNumber(stat(o, 'area')),
    rooms: extractNumber(stat(o, 'rooms')),
    address: plain(o.address) || null,
    image: Array.isArray(o.images) ? (plain(o.images[0]) ?? null) : null,
    images: toListingImages(o.images),
    description: plain(o.description),
    buildYear: normalizeBuildYear(plain(o.yearBuilt)),
    // Saves a Nominatim lookup per listing, and is the exact position rather than the centre of a
    // postcode area, which is all the address on a search card could ever resolve to.
    ...readCoordinates(o.coordinates),
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
  crawlContainer: null,
  // `newest` is what the sort dropdown calls "Aktualität - neueste zuerst". It also happens to be
  // the default order, but a job must not depend on a default the site is free to change.
  sortByDateParam: 'sort=newest',
  // ?preis_von=500&preis_bis=1200 on the current search. The `search.`-prefixed spellings are the
  // legacy ones {@link LEGACY_PARAMS} rewrites, and jobs saved before the site moved still carry
  // them, so both are looked for rather than only the modern pair.
  priceRangeParams: {
    min: ['preis_von', 'search.preis_von'],
    max: ['preis_bis', 'search.preis_bis'],
  },
  waitForSelector: null,
  crawlFields: {},
  getListings,
  normalize,
  fetchDetails,
  fetchListingByUrl,
  activityProbe: checkIfListingIsActive,
  priceTracking: {
    extract: readExposePrice,
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
  name: 'Immobilien.de',
  baseUrl: 'https://www.immobilien.de/',
  id: 'immobilienDe',
};
export { config };
