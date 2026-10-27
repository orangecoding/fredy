/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Reading a classified off the platform immowelt and SeLoger share.
 *
 * Both portals belong to the AVIV group and run one application: the same `/serp-bff/search`, the
 * same `/classifiedList/{ids}` card payload and the same exposé shell with its server state - only
 * the origin and the language differ (see `site.js`). So everything that turns what that platform
 * answers into a listing lives here, once, and the two providers are descriptors over it.
 *
 * Measured against seloger.com in September 2026: a card from `/classifiedList` carries the fields
 * below under the same paths immowelt's do, and the exposé embeds `app_cldp.data.classified` behind
 * the same `__UFRN_LIFECYCLE_SERVERREQUEST__` marker. What differs is the spelling of a figure -
 * "1 860 €" with a narrow space where immowelt writes "1.860 €" - which is why every figure goes
 * through {@link readFigure} rather than straight into `extractNumber`.
 */

import * as cheerio from 'cheerio';
import { buildHash } from '../../utils.js';
import { extractNumber } from '../../utils/extract-number.js';
import { normalizeBuildYear, normalizeEnergyClass } from '../../utils/buildingFacts.js';
import { publicationDate } from '../../utils/publicationDate.js';
import { toListingImages } from '../../utils/listingImages.js';
import logger from '../logger.js';
import { fetchExposeHtml } from './immoweltBff.js';
import { siteOf } from './site.js';
/** @import { ParsedListing } from '../../types/listing.js' */

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

/** The script tag the platform's micro-frontend shell hands its server state to the page in. */
const SERVER_STATE_MARKER = '__UFRN_LIFECYCLE_SERVERREQUEST__';

/** The `sections` entries carrying a description each, in the order they are shown on the exposé. */
const SERVER_STATE_SECTIONS = ['mainDescription', 'areaDescription', 'extendedInfoDescription'];

/**
 * The separators a figure may be grouped with. French writes thousands with a (narrow) no-break
 * space, and `extractNumber` stops at the first space it meets - "1 860 €" would be a rent of 1.
 * `\s` covers both of those spaces as well as the plain one.
 */
const GROUPING_SPACES = /\s/g;

/**
 * The euro amount in front of a title's € sign.
 *
 * The amount has to stand on its own - not be the tail of "F2" or of another figure - and may group
 * its thousands in threes with a dot or a (no-break) space, the way the two sites write them, plus
 * a decimal comma. What it may not do is run across any space: a title without an area puts the
 * room code right before the price ("T2/F2 1190 €"), and a match free to cross spaces read that as
 * a rent of 21 190 €.
 */
const TITLE_PRICE = /(?<![\p{L}\p{N}.,/])(\d{1,3}(?:[.\s]\d{3})+(?:,\d+)?|\d+(?:,\d+)?)\s*€/u;

/**
 * Read one figure, whichever of the two sites' spellings it comes in.
 *
 * @param {string|number|null|undefined} value "1.250 €", "1 860 €", "72,4" or a number
 * @returns {number|null}
 */
export function readFigure(value) {
  return extractNumber(typeof value === 'string' ? value.replace(GROUPING_SPACES, '') : value);
}

/**
 * Read the JSON the platform's shell embeds the exposé in.
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
 * "show more" truncation the page applies, and it survives a renamed `data-testid`. The DOM
 * selectors stay as the fallback for the day the shell stops embedding its state.
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
 * What only the exposé carries, added to a listing built from a card: the full description and the
 * Baujahr and energy efficiency class.
 *
 * @param {ParsedListing} listing the listing built from the card payload
 * @param {string} html the exposé page source
 * @param {any} classified the classified read from that same html
 * @returns {ParsedListing} the enriched listing
 */
function withExposeDetails(listing, html, classified) {
  return {
    ...listing,
    ...extractExposeBuildingFacts(classified),
    description: descriptionFrom(html, classified) || listing.description,
  };
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
export async function fetchClassifiedDetails(listing, browser) {
  try {
    const html = await fetchExposeHtml(browser, listing.link);
    if (!html) return listing;

    return withExposeDetails(listing, html, readClassified(html));
  } catch (error) {
    logger.warn(`Could not fetch the exposé of listing '${listing?.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * Read one of the card's key facts.
 *
 * `splitValue` is the bare figure ("72,4") next to the rendered one ("72,4 m²"), so it survives a
 * change to the unit's spelling.
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
 * at district and postcode. The city from the tracking payload is appended in that case because the
 * card's `city` is the *borough* for the big cities ("Mitte", "Spandau", "Paris 3ème
 * arrondissement"), and geocoding a borough without its city lands anywhere that happens to share
 * the name.
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
 * How the cards label a rent, and whether that rent has the running charges in it.
 *
 * SeLoger states it on every rental card - `chargesLabel` "cc" (charges comprises) or "hc" (hors
 * charges) - and quotes the one or the other advert by advert; immowelt names its figure a
 * Kaltmiete, or a Warmmiete where that is all the advertiser gave. A label that is none of these -
 * a sale's price per square metre - says nothing about charges.
 */
const CHARGES_INCLUDED_BY_LABEL = {
  cc: true,
  hc: false,
  kaltmiete: false,
  nettokaltmiete: false,
  warmmiete: true,
  gesamtmiete: true,
  bruttomiete: true,
};

/**
 * @param {any} price a card's `hardFacts.price`
 * @returns {boolean|undefined} whether the figure has the charges in it, undefined where the card
 *   does not say
 */
function readChargesIncluded(price) {
  const label = String(price?.chargesLabel ?? price?.addition?.value ?? '')
    .trim()
    .toLowerCase();
  return CHARGES_INCLUDED_BY_LABEL[label];
}

/**
 * @param {any} o a raw classified from `/classifiedList`
 * @returns {ParsedListing}
 */
export function normalizeClassified(o) {
  // The headline figure, exactly as the result card shows it: Kaltmiete on an immowelt rental,
  // Kaufpreis on a sale. `rawData.price` looks like the same number but is not - on listings where
  // immowelt estimates a warm rent it carries that estimate instead (1454.6 against a 1.250 €
  // Kaltmiete), which would report a fabricated increase on the first price probe for exactly those
  // listings.
  const price = o?.hardFacts?.price?.value ?? null;

  const rooms = readFact(o, 'numberOfRooms') ?? o?.rawData?.nbroom ?? null;
  const size = readFact(o, 'livingSpace') ?? o?.rawData?.surface?.main ?? null;

  return {
    id: buildHash(o?.id, price),
    link: o?.url,
    // `hardFacts.title` is the generic category ("Wohnung zur Miete"); the headline is the text the
    // advertiser wrote and the one the card shows in bold.
    title: (o?.mainDescription?.headline || o?.hardFacts?.title || '').trim(),
    price: readFigure(price),
    // Stored as the card states it - a SeLoger rent charges comprises stays one, since the card gives
    // no charges figure to take out - and marked as what it is, so it is compared as that.
    chargesIncluded: readChargesIncluded(o?.hardFacts?.price),
    size: readFigure(size),
    rooms: readFigure(rooms),
    address: buildAddress(o),
    image: o?.gallery?.images?.[0]?.url ?? null,
    // Without captions: the titles are upload file names ("img0 (10)_08_15_2026.jpg").
    images: toListingImages(o?.gallery?.images?.map((picture) => picture?.url)),
    description: o?.mainDescription?.description ?? null,
    publishedAt: publicationDate(o?.metadata?.creationDate),
  };
}

/**
 * The headline price of an exposé as its page title states it - the fallback of
 * {@link readExposePrice} for an exposé that embeds no state.
 *
 * The platform repeats it verbatim in the page title - "Haus 532 m² 2474300 € zum Kauf ..." on
 * immowelt, "Appartement à louer T2/F2 43 m² 1860 € Archives Paris (75003)" on SeLoger. Every
 * visible copy of it sits behind a hashed CSS class that changes with each deploy, and the detail
 * page carries no JSON-LD offer, so the title is the stable surface outside the state. It is also
 * the same figure the card shows, which is what makes the reading comparable to
 * {@link normalizeClassified}.
 *
 * The euro amount has to be picked out by hand: the title leads with the area, so handing the whole
 * string to `extractNumber` would silently record the square metres as the price. See
 * {@link TITLE_PRICE} for what counts as the amount.
 *
 * @param {string} html
 * @returns {string|null}
 */
export function readTitlePrice(html) {
  const $ = cheerio.load(html);
  const title = $('meta[property="og:title"]').attr('content') || $('title').text();
  const amount = TITLE_PRICE.exec(title ?? '')?.[1];
  return amount == null ? null : amount.replace(GROUPING_SPACES, '');
}

/**
 * The headline price of an exposé, for the price probe.
 *
 * Read out of the state the exposé embeds, where it is the card's own `hardFacts.price.value` - the
 * very figure {@link normalizeClassified} stored the listing with, so the two cannot disagree the
 * way a figure picked out of prose can. The title is the fallback for an exposé without that state.
 *
 * @param {string|null|undefined} html the exposé page source
 * @returns {number|null} the price, or null when the page states none
 */
export function readExposePrice(html) {
  if (!html) return null;
  const stated = readClassified(html)?.sections?.hardFacts?.price?.value;
  const price = readFigure(stated ?? readTitlePrice(html));
  return price != null && price > 0 ? price : null;
}

/**
 * The current price of a stored listing - the price probe of the platform's providers.
 *
 * The exposé is fetched through the warmed session rather than rendered in a fresh page: a cold
 * navigation to it meets the DataDome captcha, and a page that never renders has no price to read.
 * Only an advert on a site of the platform is asked; a sister portal's exposé (see
 * `LINKED_SITES` in `site.js`) is not the platform's to read, and its listings go untracked.
 *
 * @param {{link: string}} listing the stored listing
 * @param {import('puppeteer').Browser} browser the price tracker's browser
 * @returns {Promise<number|null>} the price, or null when it could not be read
 */
export async function probeClassifiedPrice(listing, browser) {
  if (siteOf(listing?.link) == null) return null;
  return readExposePrice(await fetchExposeHtml(browser, listing.link));
}

/**
 * Where each provider's sites serve a single advert, with the last path segment naming it.
 *
 * immowelt's exposé is `/expose/{id}` on both its sites - the classified id, or on immowelt.de the
 * legacy id (a uuid) its cards link with. SeLoger's cards spell the advert's place before the id,
 * `/annonce/location/ile-de-france/paris-75/paris-75000/2656V5QWWXYC`. Anything else - the home page,
 * a search, one of SeLoger's landing pages (`/recherche/...`) - is no advert and is answered without
 * a request.
 */
const EXPOSE_PATHS = {
  immowelt: /^\/expose\/([^/]+)\/?$/,
  seloger: /^\/annonce\/(?:[^/]+\/)+([^/]+)\/?$/,
};

/**
 * Read a url as an exposé on one site.
 *
 * The link comes out the way the cards spell it: on the site's own origin (with `www.`, over https),
 * without query, fragment or trailing slash. That is also the only form the exposé can be fetched in,
 * since the request is a same-origin `fetch` from the warmed page.
 *
 * @param {import('./site.js').ImmoweltSite} site the site the url is on
 * @param {string|null|undefined} url a pasted url, or an exposé's canonical one
 * @returns {{id: string, link: string}|null} the id the path names and the link, or null when the
 *   url is no exposé of that site's provider
 */
function readExposeUrl(site, url) {
  try {
    const { pathname } = new URL(String(url));
    const id = EXPOSE_PATHS[site.provider]?.exec(pathname)?.[1];
    return id == null ? null : { id, link: `${site.origin}${pathname.replace(/\/$/, '')}` };
  } catch {
    return null;
  }
}

/**
 * The link a search card of this advert carries, so that a later run recognises the stored row.
 *
 * The exposé's canonical url where it names an exposé on the same site: on immowelt.de that is
 * `/expose/{legacy id}`, exactly what the cards link with, whichever of the advert's urls was pasted.
 * SeLoger states no canonical, so there it is the pasted url's own path - which the cards link with
 * too, as long as it names the advert the page holds. A path naming some other id could only be a
 * spelling no search produces, and the listing would be stored twice.
 *
 * @param {import('./site.js').ImmoweltSite} site the site the advert was pasted on
 * @param {any} classified the exposé's classified
 * @param {{id: string, link: string}} pasted the pasted url, as {@link readExposeUrl} read it
 * @returns {string|null} the link, or null when none can be vouched for
 */
function cardLinkOf(site, classified, pasted) {
  const canonicalUrl = classified?.seo?.headInfo?.canonical;
  const canonical = siteOf(canonicalUrl)?.host === site.host ? readExposeUrl(site, canonicalUrl) : null;
  if (canonical != null) return canonical.link;
  return [classified.id, classified.metadata?.legacyId].includes(pasted.id) ? pasted.link : null;
}

/**
 * The exposé's classified in the shape `/classifiedList` answers a search with, so that
 * {@link normalizeClassified} reads both the same way.
 *
 * The exposé carries the same nodes, nested differently: the card's `hardFacts`, `mainDescription`
 * and `location` are sections here, its gallery is the exposé's media domain (the images alone - the
 * floor plans next to them are not on the card either), and its tracking payload is the exposé's
 * tracked item, whose `city` is what {@link buildAddress} appends to a borough.
 *
 * @param {any} classified the exposé's classified
 * @param {string} link the link the card carries, see {@link cardLinkOf}
 * @returns {any} a card
 */
function toCard(classified, link) {
  const sections = classified?.sections ?? {};
  return {
    id: classified.id,
    url: link,
    metadata: classified.metadata,
    hardFacts: sections.hardFacts,
    mainDescription: sections.mainDescription,
    location: sections.location,
    gallery: { images: classified.domains?.medias?.images },
    tracking: (classified.tracking?.av_items || []).find((item) => item?.id === classified.id),
  };
}

/**
 * The point the exposé's map shows, which spares the listing a geocode. GeoJSON order, longitude
 * first.
 *
 * @param {any} classified the exposé's classified
 * @returns {{latitude?: number, longitude?: number}}
 */
function coordinatesOf(classified) {
  const geometry = classified?.sections?.location?.geometry;
  const [longitude, latitude] =
    geometry?.type === 'Point' && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : {};
}

/**
 * Read one advert into a complete listing, for a listing the user adds by its URL.
 *
 * The exposé is fetched through the warmed session, like {@link fetchClassifiedDetails} fetches it,
 * and its classified is the card a search would have found in different clothes - see
 * {@link toCard}. Passing that through {@link normalizeClassified} is what makes the hash (the
 * classified id and `hardFacts.price.value`, which the exposé spells the way the card does) and the
 * link come out exactly as a search run stores them. The exposé's own details are then added the
 * way {@link fetchClassifiedDetails} adds them, plus the map's coordinates.
 *
 * Only an advert on one of the provider's own sites is read: a SeLoger link pasted on an immowelt
 * job is not immowelt's, and a sister portal's exposé (`LINKED_SITES` in `site.js`) is not the
 * platform's at all.
 *
 * @param {string} provider the provider asking, `immowelt` or `seloger`
 * @param {string} url the pasted url
 * @param {import('puppeteer').Browser} browser the browser started for this one read
 * @returns {Promise<ParsedListing|null>} null for a url that names no exposé of the provider, an
 *   exposé that was refused or carries no state, and one without a title
 */
export async function fetchClassifiedByUrl(provider, url, browser) {
  const site = siteOf(url);
  const pasted = site?.provider === provider ? readExposeUrl(site, url) : null;
  if (pasted == null) return null;

  try {
    const html = await fetchExposeHtml(browser, pasted.link);
    const classified = readClassified(html);
    if (!classified?.id) {
      logger.debug(`The exposé at '${pasted.link}' carries no classified to read.`);
      return null;
    }

    const link = cardLinkOf(site, classified, pasted);
    if (link == null) {
      logger.debug(`The exposé at '${pasted.link}' holds classified '${classified.id}', which its url does not name.`);
      return null;
    }

    const listing = normalizeClassified(toCard(classified, link));
    if (!listing.title) return null;

    return { ...withExposeDetails(listing, html, classified), ...coordinatesOf(classified) };
  } catch (error) {
    logger.warn(`Could not read the exposé at '${pasted.link}'.`, error?.message || error);
    return null;
  }
}

/**
 * Where each field comes from, as documentation: `getListings` bypasses the crawl container
 * entirely and nothing is scraped out of markup.
 */
export const CLASSIFIED_CRAWL_FIELDS = {
  id: 'id',
  title: 'mainDescription.headline',
  price: 'hardFacts.price.value',
  size: 'hardFacts.facts[livingSpace].splitValue',
  rooms: 'hardFacts.facts[numberOfRooms].splitValue',
  link: 'url',
  address: 'location.address',
  image: 'gallery.images[0].url',
  description: 'mainDescription.description',
};
