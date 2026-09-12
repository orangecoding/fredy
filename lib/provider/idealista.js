/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import { readAdvertModificationDate, searchListings } from '../services/idealista/search.js';
import { pageUrl, parseListings, readSearch } from '../services/idealista/website.js';
import { portalOf, requirePortal } from '../services/idealista/portal.js';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

/** The site a listing links to when nothing says otherwise, and what the job form offers. */
const BASE_URL = 'https://www.idealista.com/';

export { pageUrl, parseListings };

/**
 * Words that carry on naming the property rather than starting the place, so an " a " in front of
 * one of them is part of the type: "villetta a schiera a Lovere" is a terraced house in Lovere.
 */
const TYPE_CONTINUES = /^(schiera|corte)\b/;

/**
 * The preposition between the property type and the address, in the three languages, where the
 * word after it starts the place.
 *
 * The type is matched through the preposition that follows it rather than by listing every type the
 * three sites know, and the lookahead is what keeps a multi-word type honest: Portugal's "Moradia em
 * banda" (a terraced house) contains a preposition of its own, and splitting on the first one would
 * hand the geocoder "banda em Rua ...". Requiring the remainder to start with a capital or a digit
 * walks past it to the real one.
 */
const TYPE_PREFIX = /\s(?:in|en|na|no|em)\s(?=[\p{Lu}\d])/u;

/**
 * Split the address off a card title.
 *
 * A title reads "<type> <preposition> <street>, <district>, <town>" - "Piso en Calle de Toledo,
 * Palacio, Madrid", "Bilocale in Via Tarso, 27, San Paolo, Roma", "Apartamento T2 na Rua das
 * Olarias, Mouraria, Lisboa" - and the preposition is what the type is cut off through.
 *
 * Italian has a second one. Where an advert names no street the title reads "<type> a <district>,
 * <town>", and there the trap is doubled: a type can itself contain " a " ("villetta a schiera a
 * Lovere"), and taking the last " a " instead is no answer either, since a town can be called
 * "Bagno a Ripoli". So that separator is the first " a " that is not the one inside the type, and
 * it is only looked for once the prepositions that start a place have found nothing.
 *
 * @param {string|undefined} title
 * @returns {string|null}
 */
function readAddress(title) {
  if (typeof title !== 'string') return null;

  const prefixed = TYPE_PREFIX.exec(title);
  if (prefixed != null) {
    return title.slice(prefixed.index + prefixed[0].length).trim() || null;
  }

  // A title whose place begins in lower case - a street written "via Tarso" - matches no lookahead,
  // and the separator is still the preposition.
  if (title.includes(' in ')) {
    return title.slice(title.indexOf(' in ') + 4).trim() || null;
  }

  for (let index = title.indexOf(' a '); index >= 0; index = title.indexOf(' a ', index + 1)) {
    const rest = title.slice(index + 3);
    if (!TYPE_CONTINUES.test(rest)) return rest.trim() || null;
  }
  return null;
}

/**
 * The room count, as each site labels it.
 *
 * Spain counts bedrooms ("3 hab."), Italy counts rooms ("3 locali", "1 locale"), and Portugal uses
 * its typology instead ("T2"), where the digit is again the number of bedrooms. A studio carries
 * none of them, and is left without a room count rather than being called a one-room flat: the spec
 * filter skips a listing whose rooms it does not know, which is the right outcome for a flat that
 * has no separate rooms to count.
 */
const ROOMS_TYPOLOGY = /^T(\d+)\b/;
const ROOMS_COUNTED = /(\d+)\s*(?:hab\.?|local[ei]|quartos?)\b/i;

/** The living area. Portugal appends what the figure measures ("79 m² área bruta"). */
const LIVING_AREA = /(\d[\d.,]*)\s*m²/;

/**
 * @param {string[]} characteristics
 * @param {RegExp} pattern
 * @returns {number|null}
 */
function readCharacteristic(characteristics, pattern) {
  const match = characteristics.map((entry) => entry.match(pattern)).find(Boolean);
  return match == null ? null : extractNumber(match[1]);
}

/**
 * Read a card scraped off a result page.
 *
 * The chips a card carries are an unlabelled list whose contents vary per listing - "Garaje
 * incluido", the floor, and on a rental search how long ago the advert appeared - so each figure is
 * found by what it looks like rather than by its position. Reading the list by position turned "2
 * minutos" into a two-room flat.
 *
 * @param {any} o one card of the search page
 * @returns {ParsedListing}
 */
function normalizeCard(o) {
  const price = extractNumber(o?.price);
  const characteristics = Array.isArray(o?.characteristics) ? o.characteristics : [];

  return {
    id: buildHash(String(o?.id ?? ''), price == null ? null : String(price)),
    title: o?.title,
    link: o?.link ?? null,
    price,
    size: readCharacteristic(characteristics, LIVING_AREA),
    rooms: readCharacteristic(characteristics, ROOMS_TYPOLOGY) ?? readCharacteristic(characteristics, ROOMS_COUNTED),
    address: readAddress(o?.title),
    description: o?.description,
    image: o?.image,
    publishedAt: activationDate(o?.firstActivationDate),
  };
}

/**
 * A figure the api gives, or null where it gives none.
 *
 * The api writes a missing figure as zero rather than leaving the field out - a price on request, a
 * garage nobody counted rooms for - and a zero read as a figure would be a free flat of no size.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function figure(value) {
  return typeof value === 'number' && value > 0 ? value : null;
}

/**
 * The moment the advert was activated on the portal, as epoch milliseconds.
 *
 * `firstActivationDate` is the closest thing the api has to a publication date - it is the field
 * its own `publicationDate` ordering sorts by - and it is already epoch milliseconds, so reading
 * it is only a matter of refusing what is not one.
 *
 * @param {unknown} value
 * @returns {number|undefined}
 */
function activationDate(value) {
  return figure(value) ?? undefined;
}

/**
 * Read an advert the api answered with.
 *
 * The title is the api's `address`, which is the very line the website prints on a card
 * ("Bilocale in Via Tito Vignoli s.n.c, Lorenteggio, Milano"), so an advert read either way is
 * stored under the same hash and described in the same words.
 *
 * @param {any} o one advert of the api's answer
 * @returns {ParsedListing}
 */
function normalizeAdvert(o) {
  const price = typeof o?.price === 'number' ? figure(o.price) : extractNumber(o?.price);
  const title = typeof o?.address === 'string' ? o.address : null;

  return {
    id: buildHash(String(o?.propertyCode ?? ''), price == null ? null : String(price)),
    title,
    link: o?.url ?? null,
    price,
    size: figure(o?.size),
    rooms: figure(o?.rooms),
    address: readAddress(title ?? undefined),
    description: o?.description,
    image: o?.thumbnail,
    // The api gives every advert a point, which spares the geocoder a lookup. An advert that hides
    // its address is placed at the middle of its neighbourhood rather than at its door.
    latitude: typeof o?.latitude === 'number' ? o.latitude : undefined,
    longitude: typeof o?.longitude === 'number' ? o.longitude : undefined,
    publishedAt: activationDate(o?.firstActivationDate),
  };
}

/**
 * @param {any} o one advert, from either source
 * @returns {ParsedListing}
 */
function normalize(o) {
  return o?.propertyCode == null ? normalizeCard(o) : normalizeAdvert(o);
}

/**
 * Read the adverts of a search, through the api where the url can be translated into it.
 *
 * A failing api is treated as an untranslatable url: the website still holds the search, and a run
 * that reads it is better than a run that finds nothing.
 *
 * @this {any} the pipeline run, which is where the job's key comes from. The catch-up walk of a
 *   search is remembered per job, and a caller that binds nothing simply pays it again.
 * @param {string} url the job's search url
 * @param {any} [browser] the shared browser of the current job run, used for the website fallback
 * @returns {Promise<any[]>}
 */
async function getListings(url, browser) {
  const portal = requirePortal(url, 'this job');
  if (portal == null) return [];

  try {
    const found = await searchListings(portal, url, this?._jobKey ?? null);
    if (found != null) return found;
  } catch (error) {
    logger.error(`Idealista's api did not answer (${error.message}); reading the website instead.`);
  }
  return readSearch(url, browser);
}

/**
 * Read the date the portal itself states an advert was last modified.
 *
 * The search answers no dates - the api stopped carrying `firstActivationDate` in its answers -
 * while the detail the android app opens for one advert carries `modificationDate`, which is the
 * very "Annuncio aggiornato ..." the website prints. One request per *new* listing: the pipeline
 * enriches only what it has not stored yet.
 *
 * @param {ParsedListing} listing The listing to attach the date to.
 * @returns {Promise<ParsedListing>} The same listing, with `publishedAt` when the api gave a date.
 */
async function fetchDetails(listing) {
  // Every advert url the portal writes ends in the code that names it, whichever section it was
  // found in - "immobile" for a plain advert, "nuova-costruzione" for one of a development's
  // units - so the code is read off the tail rather than off any one section's name.
  const code = listing?.link?.match(/\/(\d+)\/?$/)?.[1];
  const portal = portalOf(listing?.link);
  if (code == null || portal == null) return listing;

  try {
    const modifiedAt = await readAdvertModificationDate(portal, code);
    if (modifiedAt != null) listing.publishedAt = modifiedAt;
  } catch (error) {
    // A date the api would not give is not worth failing a run over; the listing keeps its
    // created_at and the order falls back to what it has always been.
    logger.debug(`Idealista: no date for ${code} (${error?.message}).`);
  }
  return listing;
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList Terms the job wants filtered out.
 * @returns {boolean}
 */
function applyBlacklist(o, appliedBlackList) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return o.title != null && titleNotBlacklisted && descNotBlacklisted;
}

/**
 * How idealista writes a price bound into a search url.
 *
 * Not query parameters: the filters are path segments (`/alquiler-viviendas/madrid-madrid/
 * con-precio-desde_800,precio-hasta_1200/`), several of them comma-separated inside one segment,
 * and the first of them carries a `con-`/`com-` prefix that the others do not. The names are read
 * across all three sites at once rather than per host, so a url is understood whichever domain it
 * was copied from - and whichever domain a job was migrated between.
 *
 * Italy spells its upper bound as the bare `prezzo`, one dash away from its own lower one, which is
 * why the names are matched whole and not by prefix. The same table is what
 * `lib/services/idealista/search-filters.js` translates for the api.
 */
const PRICE_SEGMENTS = {
  min: ['precio-desde', 'prezzo-min', 'preco-min'],
  max: ['precio-hasta', 'prezzo', 'preco-max'],
};

/**
 * Read one price bound out of a search url's path segments.
 *
 * @param {string} url
 * @param {string[]} names the spellings that carry this bound
 * @returns {string|null} the bound as written, or null when the search does not set it
 */
function priceBoundFromPath(url, names) {
  for (const segment of new URL(url).pathname.split('/')) {
    for (const filter of segment.split(',')) {
      const [name, value] = filter.replace(/^co[nm]-/, '').split('_');
      if (names.includes(name) && value) return value;
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

/** @type {ProviderConfig} */
const config = {
  url: null,
  requiredFieldNames: ['id', 'title', 'link', 'price', 'size', 'rooms', 'address'],
  priceRangeParams: { parse: parsePriceRange },
  // The adverts are read by `getListings`, from the api or from the cards, so the generic crawler
  // has no work.
  crawlContainer: null,
  crawlFields: {},
  // The api sorts by publication date itself, and the website disallows that sort in its
  // robots.txt - `/*?ordine=pubblicazione-desc` on .it, `/*?ordenado-por=fecha-publicacion-` on
  // .com - so there is no ordering to ask for in the url either way. The website fallback reads
  // every result page instead of the first page of a ranking.
  getListings,
  normalize,
  fetchDetails,
  activityProbe: checkIfListingIsActive,
};

/**
 * Which of the three markets one advert is in.
 *
 * `countries` has to name all three - it is what the job form flags the provider with and what the
 * map takes its bounds from, and none of those has a listing to ask. Everything that *does* hold a
 * listing wants one country rather than three: the geocoder searching `es,it,pt` can answer a
 * Milanese street with its Spanish namesake, and the connectivity sweep would send an advert in
 * Madrid to whichever of the three has a coverage register, which reads the address in the wrong
 * language, spends a throttled request on it and stamps the listing "nothing here" until the
 * answer goes stale.
 *
 * The link is what says which site the advert is on, and it is the one thing every stored row keeps
 * - the search url that found it belongs to the job, not to the listing, and a job's url can be
 * changed to another country after the fact. A row whose link is missing or points somewhere else
 * answers null, and the caller keeps all three.
 *
 * @param {{link?: string|null}|null|undefined} listing
 * @returns {string|null} `es`, `it`, `pt`, or null when the link names no idealista site.
 */
function countryOf(listing) {
  return portalOf(listing?.link)?.country ?? null;
}

export const metaInformation = {
  countries: ['es', 'it', 'pt'],
  countryOf,
  name: 'Idealista',
  baseUrl: BASE_URL,
  id: 'idealista',
};

/**
 * Build a run-scoped provider configuration.
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

export { config };
