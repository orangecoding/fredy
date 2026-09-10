/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * idealista, the largest property portal in Spain, Italy and Portugal.
 *
 * One provider covers all three because they are one site: idealista.com, idealista.it and
 * idealista.pt are served by the same application, translated. The result cards carry identical
 * markup down to the class names, so a single parser reads all of them - what differs is the
 * language inside the cards, and that is what {@link PORTALS} and the readers below account for.
 *
 * The page itself comes from `lib/services/idealista/idealistaSearch.js`: the origin sits behind
 * DataDome and the first response to any search is a 403 challenge that has to be waited out in a
 * real browser.
 */

import * as cheerio from 'cheerio';
import { buildHash, isOneOf } from '../utils.js';
import { extractNumber } from '../utils/extract-number.js';
import { fetchSearchHtml } from '../services/idealista/idealistaSearch.js';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.idealista.com/';

/**
 * What each national site spells differently.
 *
 * Only the sort parameter lives here. It cannot go on `config.sortByDateParam` like every other
 * provider's, because that is one static string applied to whatever URL the job carries, and the
 * three sites do not agree on either the parameter or its value - `ordenado-por=` on .com would be
 * ignored by .it and the job would silently search the *most relevant* flats instead of the newest.
 *
 * @type {Object.<string, {sortByDate: string}>}
 */
const PORTALS = {
  'idealista.com': { sortByDate: 'ordenado-por=fecha-publicacion-desc' },
  'idealista.it': { sortByDate: 'ordine=pubblicazione-desc' },
  'idealista.pt': { sortByDate: 'ordem=atualizado-desc' },
};

/** What an unrecognised host is treated as, Spain being the site the domain `idealista.com` serves. */
const DEFAULT_PORTAL = PORTALS['idealista.com'];

/**
 * How idealista writes a price bound into a search URL.
 *
 * Not query parameters: the filters are path segments (`/alquiler-viviendas/madrid-madrid/
 * con-precio-desde_800,precio-hasta_1200/`), several of them comma-separated inside one segment,
 * and the first of them carries a `con-`/`com-` prefix that the others do not. The names are read
 * across all three sites at once rather than per host, so a URL is understood whichever domain it
 * was copied from.
 *
 * Note that Italy spells its upper bound as the bare `prezzo`, which is why the lists are matched
 * exactly and not by prefix - `prezzo-min` would otherwise read as an upper bound too.
 */
const PRICE_SEGMENTS = {
  min: ['precio-desde', 'prezzo-min', 'preco-min'],
  max: ['precio-hasta', 'prezzo', 'preco-max'],
};

/** One result card. `article.item` also matches the "new development" carousel, which has no link. */
const CARD = 'article.item';

/**
 * The bedroom or room count, as each site labels it.
 *
 * Spain counts bedrooms ("3 hab."), Italy counts rooms ("3 locali", "1 locale"), and Portugal uses
 * its typology instead ("T2"), where the digit is again the number of bedrooms. A studio carries
 * none of them, and is left without a room count rather than being called a one-room flat: the spec
 * filter skips a listing whose rooms it does not know, which is the right outcome for a flat that
 * has no separate rooms to count.
 */
const ROOMS_TYPOLOGY = /^T(\d+)\b/;
const ROOMS_COUNTED = /(\d+)\s*(?:hab\.?|local[ei])\b/i;

/** The living area. Portugal appends what the figure measures ("79 m² área bruta"). */
const LIVING_AREA = /(\d[\d.,]*)\s*m²/;

/**
 * The property type idealista puts in front of every card title, e.g. "Piso en Calle de Toledo,
 * Palacio, Madrid" or "Apartamento T2 na Rua das Olarias, 33, Mouraria, Lisboa".
 *
 * Dropping it is what turns the title into an address the geocoder can use. The type is matched
 * through the preposition that follows it rather than by listing every type the three sites know,
 * and the lookahead is what keeps multi-word types honest: Portugal's "Moradia em banda" (a
 * terraced house) contains a preposition of its own, and splitting on the first one would hand the
 * geocoder "banda em Rua …". Requiring the remainder to start with a capital or a digit walks past
 * it to the real one.
 */
const TYPE_PREFIX = /^.*?\s(?:en|in|na|no|em)\s(?=[\p{Lu}\d])/u;

/**
 * Which national site a search URL belongs to.
 *
 * @param {string} url
 * @returns {{sortByDate: string}}
 */
function portalOf(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return PORTALS[host] ?? DEFAULT_PORTAL;
  } catch {
    return DEFAULT_PORTAL;
  }
}

/**
 * The search URL with idealista's own "newest first" ordering applied.
 *
 * Replaces whatever ordering the pasted URL carried, so a search the user saved sorted by price
 * still reports the listings that appeared since the last run rather than the cheapest ones.
 *
 * @param {string} url
 * @returns {string}
 */
function sortedByDate(url) {
  try {
    const sorted = new URL(url);
    const [name, value] = portalOf(url).sortByDate.split('=');
    sorted.searchParams.set(name, value);
    return sorted.toString();
  } catch {
    logger.error(`Could not read the idealista search URL: ${url}`);
    return url;
  }
}

/**
 * Read one price bound out of a search URL's path segments.
 *
 * @param {string} url
 * @param {string[]} names the spellings that carry this bound
 * @returns {string|null} the bound as written, or null when the search does not set it
 */
function priceBoundFromPath(url, names) {
  const path = new URL(url).pathname;

  for (const segment of path.split('/')) {
    for (const filter of segment.split(',')) {
      const [name, value] = filter.replace(/^co[nm]-/, '').split('_');
      if (names.includes(name) && value) {
        return value;
      }
    }
  }

  return null;
}

/**
 * @param {string} url
 * @returns {{min: string|null, max: string|null}}
 */
function parsePriceRange(url) {
  return {
    min: priceBoundFromPath(url, PRICE_SEGMENTS.min),
    max: priceBoundFromPath(url, PRICE_SEGMENTS.max),
  };
}

/**
 * The first of a card's detail chips that a reader understands.
 *
 * The chips are an unlabelled list whose contents vary per listing - "Garaje incluido", the floor,
 * and on rental searches how long ago the advert appeared - so each figure is found by what it
 * looks like rather than by its position.
 *
 * @param {string[]} details
 * @param {RegExp} pattern
 * @returns {string|null} the captured group, or null when no chip matched
 */
function readDetail(details, pattern) {
  for (const detail of details) {
    const match = pattern.exec(detail);
    if (match != null) return match[1];
  }
  return null;
}

/**
 * Turn a search page into one raw entry per result card.
 *
 * @param {string} html the search page source
 * @param {string} url the search url, which is what relative links are resolved against
 * @returns {Object[]}
 */
export function parseListings(html, url) {
  const $ = cheerio.load(html);
  const listings = [];

  $(CARD).each((_, element) => {
    const card = $(element);
    const link = card.find('a.item-link').first();
    // The "Obra nueva" / "Nuova costruzione" carousel is made of `article.item` too, but its cards
    // advertise a development rather than a flat: no price, no living area, and a link that opens
    // the project. They carry no `item-link`, which is what separates them here.
    if (link.length === 0) return;

    const details = card
      .find('.item-detail-char .item-detail')
      .map((__, detail) => $(detail).text().replace(/\s+/g, ' ').trim())
      .get();

    listings.push({
      id: card.attr('data-element-id') ?? null,
      // The `title` attribute holds the same text as the anchor but without the surrounding
      // whitespace the markup is indented with.
      title: (link.attr('title') ?? link.text()).replace(/\s+/g, ' ').trim(),
      link: new URL(link.attr('href') ?? '', url).toString(),
      price: card.find('.item-price').first().text().replace(/\s+/g, ' ').trim(),
      rooms: readDetail(details, ROOMS_TYPOLOGY) ?? readDetail(details, ROOMS_COUNTED),
      size: readDetail(details, LIVING_AREA),
      description: card.find('.item-description').text().replace(/\s+/g, ' ').trim() || null,
      // Adverts published without photos exist on every one of the three sites and say so in place
      // of the gallery, so an image is a nice-to-have rather than a reason to drop the listing.
      image: card.find('picture.item-multimedia img').first().attr('src') ?? null,
    });
  });

  return listings;
}

/**
 * @param {string} url the job's search URL
 * @param {any} browser the shared browser of the current job run
 * @returns {Promise<Object[]>}
 */
async function getListings(url, browser) {
  const searchUrl = sortedByDate(url);
  const html = await fetchSearchHtml(searchUrl, browser);

  if (html == null) {
    return [];
  }

  return parseListings(html, searchUrl);
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  return {
    // The price goes into the hash like everywhere else, so a reduction reaches the user as a new
    // listing instead of passing unnoticed.
    id: buildHash(o.id, o.price),
    title: o.title,
    link: o.link,
    // "1.400€/mes", "950€/mese", "3.000.000€" - the dot groups thousands on all three sites, which
    // is what the German-formatted reader already assumes.
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address: o.title == null ? null : o.title.replace(TYPE_PREFIX, ''),
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
  // The page is fetched and parsed by `getListings`, so there is no container for the generic
  // parser to walk: a card's room count and living area sit in an unlabelled list of chips that
  // only a reader looking at their contents can tell apart.
  crawlContainer: null,
  crawlFields: {},
  // Applied per national site inside `getListings`, see PORTALS.
  sortByDateParam: null,
  priceRangeParams: { parse: parsePriceRange },
  getListings,
  normalize,
};

export const metaInformation = {
  countries: ['es', 'it', 'pt'],
  name: 'idealista',
  baseUrl: BASE_URL,
  id: 'idealista',
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
