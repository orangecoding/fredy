/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * BETTERHOMES, read through the JSON API its own search page talks to.
 *
 * The search results page ships empty - `<ul id="search-result-list">` with nothing in it - and
 * fills itself from `POST /apirequest` with `{action: 'Object/search'}`. Scraping the rendered page
 * would mean running a browser to watch it call an endpoint we can call directly, so the provider
 * talks to that endpoint instead: no browser, one request per run, and the whole result set in one
 * response (the endpoint does not page).
 *
 * The payload is the search form's own field names, which is also what the page writes into its
 * URL: `?searchType=rent&objectType=apartment&priceMax=1500&...`. So the query string of the URL a
 * user pastes *is* the API payload, and every filter the portal offers is carried over without this
 * file having to know what any of them mean.
 *
 * One application on three domains - betterhomes.de, .at and .ch - differing only in the host and
 * the `countryCode` that host's pages send. `PORTALS` is that difference.
 */

import { buildHash, isOneOf } from '../utils.js';
import logger from '../services/logger.js';
import { normalizeBuildYear, normalizeEnergyClass } from '../utils/buildingFacts.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

/**
 * The BETTERHOMES sites, by bare hostname.
 *
 * `countryCode` is not cosmetic: the endpoint answers with the listings of the country it is told
 * about, so sending `DE` to betterhomes.ch returns nothing at all rather than Swiss listings.
 *
 * @type {Record<string, {origin: string, country: string}>}
 */
const PORTALS = {
  'betterhomes.de': { origin: 'https://www.betterhomes.de', country: 'de' },
  'betterhomes.at': { origin: 'https://www.betterhomes.at', country: 'at' },
  'betterhomes.ch': { origin: 'https://www.betterhomes.ch', country: 'ch' },
};

/** The site Fredy falls back to when a URL names none of them. */
const DEFAULT_PORTAL = PORTALS['betterhomes.de'];

/** Where a listing lives, on every one of the three sites. */
const DEFAULT_DETAIL_PATH = '/de/immobilie-suchen/detail';

/**
 * A desktop browser. The endpoint answers without it, but a portal seeing its own search page's
 * user agent has one less reason to start looking closely.
 */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** `/de/immobilie-suchen/detail/objectId/<uuid>` - the only part of a link worth reading back. */
const OBJECT_ID_IN_LINK = /\/objectId\/([0-9a-f-]{36})/i;

/** What `Object/detail` answers, next to a null `responseData`, for an object that no longer exists. */
const NOT_FOUND_CODE = 1000;

/**
 * A url reduced to the bare host `PORTALS` is keyed by.
 *
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
function hostOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Which BETTERHOMES site a url is on.
 *
 * @param {string|null|undefined} url
 * @returns {{origin: string, country: string}|null} null when the url names no BETTERHOMES site.
 */
function portalOf(url) {
  const host = hostOf(url);
  return host == null ? null : (PORTALS[host] ?? null);
}

/**
 * The language a url is in, which the sites carry as their first path segment.
 *
 * Read off the url rather than hardcoded because betterhomes.ch serves German, French and Italian,
 * and the endpoint answers in whichever it is told - which is what ends up in the description the
 * user's blacklist is matched against.
 *
 * @param {URL} parsed
 * @returns {string} an ISO 639-1 code, `de` when the path does not start with one.
 */
function languageOf(parsed) {
  const first = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
  return /^[a-z]{2}$/i.test(first) ? first.toLowerCase() : 'de';
}

/**
 * Where this run's listings link to.
 *
 * The detail page sits beside the search page it was opened from - `/…/immobilie-suchen/kaufen`
 * becomes `/…/immobilie-suchen/detail` - so the link is built by swapping the last path segment
 * rather than by hardcoding a German path onto a French search.
 *
 * @param {string|null|undefined} searchUrl
 * @returns {string} an absolute path, always starting with a slash.
 */
function detailPathOf(searchUrl) {
  let parsed;
  try {
    parsed = new URL(String(searchUrl));
  } catch {
    return DEFAULT_DETAIL_PATH;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    return DEFAULT_DETAIL_PATH;
  }
  return `/${[...segments.slice(0, -1), 'detail'].join('/')}`;
}

/**
 * Call the endpoint the search page calls.
 *
 * @param {string} origin The site to ask, e.g. `https://www.betterhomes.de`.
 * @param {string} action The API action, e.g. `Object/search`.
 * @param {Object} data The action's payload.
 * @param {string} [referer] The page the request pretends to come from.
 * @returns {Promise<any|null>} The parsed body, or null when the endpoint refused to answer.
 */
async function callApi(origin, action, data, referer) {
  const response = await fetch(`${origin}/apirequest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      ...(referer ? { Referer: referer } : {}),
    },
    body: JSON.stringify({ action, method: 'POST', data }),
  });

  if (!response.ok) {
    logger.error(`Error fetching data from BETTERHOMES API (${action}):`, response.statusText);
    return null;
  }
  return response.json();
}

/**
 * The `Object/search` payload for a pasted search url.
 *
 * Every query parameter is carried over as it stands, because the page builds both its URL and this
 * payload out of the same form fields - so a filter Fredy has never heard of still reaches the
 * portal. Empty parameters are dropped: the form leaves an untouched bound in the url as `priceMax=`
 * and the endpoint reads that as a bound of zero.
 *
 * @param {string} url The job's search url.
 * @returns {Object} The payload, with the country, language and sort order the page adds itself.
 */
export function buildSearchPayload(url) {
  const portal = portalOf(url) ?? DEFAULT_PORTAL;
  /** @type {Record<string, string>} */
  const data = {};

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    parsed = new URL(`${portal.origin}${DEFAULT_DETAIL_PATH}`);
  }

  for (const [key, value] of parsed.searchParams) {
    if (value !== '') {
      data[key] = value;
    }
  }

  data.countryCode = portal.country.toUpperCase();
  data.languageCode = languageOf(parsed);
  // The page defaults its own sort the same way, and the pipeline has already appended
  // `sortByDateParam` by the time this runs, so this only covers a url that predates it.
  data.sortOrder = data.sortOrder || 'newestDesc';

  return data;
}

/**
 * Fetch one run's listings.
 *
 * Invoked by the pipeline with `this` bound to the executioner; nothing run-specific is read off
 * module scope, so two jobs in flight at once cannot see each other's search.
 *
 * @param {string} url The job's search url, already sorted by date by the pipeline.
 * @returns {Promise<any[]>} The rows the endpoint returned, untouched.
 */
async function getListings(url) {
  const portal = portalOf(url);
  // A url this provider cannot place - saved without its scheme, or on another host - carried no
  // filters it could read, and the fallback below it was an unfiltered search of every German
  // advert, all of which were then stored and notified.
  if (portal == null) {
    logger.error(`BETTERHOMES: '${url}' is not a BETTERHOMES search url, nothing was searched.`);
    return [];
  }
  const rows = await callApi(portal.origin, 'Object/search', buildSearchPayload(url), url);

  // The endpoint answers a search with a bare array. Anything else is a shape this provider does
  // not understand, and guessing at it would store nonsense under the job.
  return Array.isArray(rows) ? rows : [];
}

/**
 * A number the endpoint reports as a machine decimal (`"1100000.00"`, `"52.5167"`), or null.
 *
 * Deliberately not `extractNumber`, the same trap flatfox documents: that one reads human-formatted
 * text, where a dot before exactly three digits is a thousands separator, so a coordinate such as
 * `"47.377"` came back as 47377 - which put the listing outside every area filter and made MapLibre
 * throw on it.
 *
 * @param {string|number|null|undefined} value
 * @returns {number|null}
 */
function machineNumber(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (text === '') return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

/**
 * A figure the endpoint reports as a string, as a number - or null where it reports "unknown".
 *
 * Absent values arrive as the string `"0"` rather than as null for every area and room count, so a
 * flat with no stated living space would otherwise be stored as nought square metres and dropped by
 * a user's minimum-size filter, which is not what "the portal did not say" means.
 *
 * @param {string|number|null|undefined} value
 * @returns {number|null}
 */
function positiveNumber(value) {
  const number = machineNumber(value);
  return number == null || number <= 0 ? null : number;
}

/**
 * An amount the endpoint reports either as a machine decimal or as display text.
 *
 * Which one depends on the site and the action: the German and Swiss search rows carry `priceNet`
 * as `"850"`, the Austrian ones as `"€   1.600,-"`, and every detail payload as display text -
 * `"850 &euro;"`, `"€   684,55"`, `"CHF 1'795.-"`. Display text groups thousands with dots
 * (German) or apostrophes (Swiss), writes cents after a comma, and a dash for none.
 *
 * @param {string|number|null|undefined} value
 * @returns {number|null}
 */
function amountOf(value) {
  if (value == null) return null;
  // Currency entities out first: a numeric one (`&#8364;`) would otherwise read as a number.
  const text = String(value)
    .replace(/&[#\w]+;/g, ' ')
    .trim();

  // One rule for both spellings. A dot before exactly three final digits groups thousands
  // ("1.500 &euro;" is 1500), any other dot is a decimal point ("1150.00", "684.55") - money never
  // has three decimals, so the one reading the two spellings could disagree on does not occur.
  const match = text.match(/\d[\d.']*(?:,(?:\d+|-))?/);
  if (match == null) return null;

  let number = match[0].replace(/[,.]-?$/, '');
  if (number.includes(',')) {
    number = number.replace(/[.']/g, '').replace(',', '.');
  } else if (number.includes("'")) {
    number = number.replace(/'/g, '');
  } else if (/\.\d{3}$/.test(number)) {
    number = number.replace(/\./g, '');
  }
  const result = Number(number);
  return Number.isFinite(result) ? result : null;
}

/**
 * Whether a search row (`rental: 'M'`, against `'K'` for a sale) or a detail payload
 * (`rental: true`) is a rental.
 *
 * @param {any} row
 * @returns {boolean}
 */
function isRental(row) {
  return row?.rental === 'M' || row?.rental === true;
}

/**
 * What one listing costs, or null when the portal is not saying.
 *
 * A rental is priced at its Nettomiete, which is what the rest of Fredy means by a rent: the
 * affordability check adds the Nebenkosten itself (see `lib/services/finance/constants.js`), and
 * flatfox reads `rent_net` first for the same reason. `priceGrossFloat` is the Bruttomiete, and
 * reading it counted the Nebenkosten twice - a flat at 850 net and 1150 gross came out at about
 * 1440, and a job capped at 1200 dropped it. The gross figure stays the fallback for a rental
 * whose net figure is missing.
 *
 * For a sale `priceGrossFloat` is the price, the one plain figure in the row: `priceGross` is
 * display text, and it reads "Preis auf Anfrage" for a withheld price, which the machine-readable
 * field spells as `0.00`.
 *
 * Search rows and detail payloads go through the same function, so the price the list stored and
 * the one the price probe reads later are always the same figure.
 *
 * @param {any} row
 * @returns {number|null}
 */
function readPrice(row) {
  // Two spellings of "price on request": the search rows carry `be_obj_preisnachvereinbarung`, the
  // detail payload the price probe reads carries `priceOnApplication` instead. Missing the second,
  // the probe recorded a withheld price as the listing's price.
  if (row?.be_obj_preisnachvereinbarung === '1' || [true, 1, '1', 'true'].includes(row?.priceOnApplication)) {
    return null;
  }
  if (isRental(row)) {
    const net = amountOf(row?.priceNet);
    if (net != null && net > 0) {
      return net;
    }
  }
  return positiveNumber(row?.priceGrossFloat);
}

/**
 * @param {any} row
 * @returns {string|null}
 */
function buildAddress(row) {
  // The street is never published on a BETTERHOMES advert - it is what the enquiry is for - so the
  // town is the whole address, and the region is left off because it only makes the geocode vaguer.
  const address = [row?.zipcode, row?.city].filter(Boolean).join(' ').trim();
  return address.length > 0 ? address : null;
}

/**
 * @param {any} row
 * @returns {string|null}
 */
function buildImage(row) {
  const image = (row?.images ?? []).find((entry) => entry?.imageUrl)?.imageUrl;
  return image ?? null;
}

/**
 * Turn one row of the search response into the shape the pipeline works with.
 *
 * @param {any} o A row as the endpoint returned it.
 * @param {string} [runUrl] The job's search url, which says which site to link to.
 * @returns {ParsedListing}
 */
function normalize(o, runUrl) {
  const portal = portalOf(runUrl) ?? DEFAULT_PORTAL;
  const price = readPrice(o);
  const uniqueKey = o?.uniqueKey ?? o?.objectId;

  return {
    // The price is part of the hash on purpose: a re-listed advert keeps its object id, and this is
    // how the pipeline notices the one that came back cheaper. Stringified because `buildHash`
    // drops anything without a `length`, so a numeric price would silently not be hashed at all.
    id: buildHash(uniqueKey, price == null ? null : String(price)),
    link: `${portal.origin}${detailPathOf(runUrl)}/objectId/${uniqueKey}`,
    title: (o?.title ?? '').trim(),
    price,
    size: positiveNumber(o?.livingSpace) ?? positiveNumber(o?.usableArea),
    rooms: positiveNumber(o?.rooms),
    address: buildAddress(o),
    image: buildImage(o),
    // The search response carries no prose at all; `fetchDetails` is where a description comes from.
    description: o?.description ?? '',
  };
}

/**
 * The description, assembled out of the three blocks the detail page shows as prose.
 *
 * @param {any} detail The `responseData` of an `Object/detail` answer.
 * @returns {string}
 */
function buildDescription(detail) {
  return [detail?.descriptionText, detail?.advantage, detail?.location]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * A coordinate the detail page reports, as a number - or null for one that cannot be a coordinate.
 *
 * @param {string|number|null|undefined} value
 * @param {number} limit 90 for a latitude, 180 for a longitude.
 * @returns {number|null}
 */
function readCoordinate(value, limit) {
  const number = machineNumber(value);
  return number == null || number === 0 || Math.abs(number) > limit ? null : number;
}

/**
 * Enrich a listing from `Object/detail`.
 *
 * Worth the request for the prose the blacklist is matched against, the building facts, and the
 * address in the detail's own spelling (postcode and district, "12161 Berlin-Schöneberg").
 *
 * The coordinates it carries are the town's centre - the portal labels its map "Lageplan
 * (Ortsmitte)" - so every Berlin advert, whatever the district, sits in Mitte. Taken over, they
 * stopped the pipeline from geocoding the postcode, and area filters, distances and travel times
 * were worked out from the wrong end of the city. They are only used for a listing that has no
 * address to geocode at all.
 *
 * Never rejects. A listing that could not be enriched is still a listing worth notifying about.
 *
 * @param {ParsedListing} listing
 * @returns {Promise<ParsedListing>}
 */
async function fetchDetails(listing) {
  try {
    const portal = portalOf(listing.link) ?? DEFAULT_PORTAL;
    const objectId = OBJECT_ID_IN_LINK.exec(listing.link ?? '')?.[1];
    if (objectId == null) return listing;

    const body = await callApi(
      portal.origin,
      'Object/detail',
      { id: objectId, countryCode: portal.country.toUpperCase(), languageCode: languageOf(new URL(listing.link)) },
      listing.link,
    );

    const detail = body?.responseData;
    if (detail == null) return listing;

    const description = buildDescription(detail);
    const address = (detail.address?.city ?? '').trim() || listing.address;
    // The town centre, and only as a last resort: see above.
    const useTownCentre = address == null || String(address).trim() === '';
    const latitude = useTownCentre ? readCoordinate(detail.address?.cityLatitude, 90) : null;
    const longitude = useTownCentre ? readCoordinate(detail.address?.cityLongitude, 180) : null;

    return {
      ...listing,
      description: description || listing.description,
      address,
      latitude: latitude ?? listing.latitude,
      longitude: longitude ?? listing.longitude,
      buildYear: normalizeBuildYear(detail.constructionYear) ?? listing.buildYear,
      energyClass: normalizeEnergyClass(detail.energyPass?.efficiencyClass) ?? listing.energyClass,
    };
  } catch (error) {
    logger.warn(`Could not fetch BETTERHOMES detail for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * Ask the detail endpoint about a stored listing.
 *
 * The rendered detail page is no use for this: it is a shell that answers 200 for any object id at
 * all and only finds out otherwise once its own JavaScript has asked. The endpoint is the one that
 * knows, and says so as `responseCode: 1000` with a null `responseData`.
 *
 * @param {string} link The stored listing's link.
 * @returns {Promise<{active: number, detail: any|null}>} `active` is 1, 0 or -1 as the pipeline's
 *   probes report it; `detail` is the payload when there was one, so a caller needing a field off
 *   it does not have to ask twice.
 */
async function probeDetail(link) {
  try {
    const portal = portalOf(link);
    const objectId = OBJECT_ID_IN_LINK.exec(link ?? '')?.[1];
    if (portal == null || objectId == null) {
      return { active: -1, detail: null };
    }

    const body = await callApi(
      portal.origin,
      'Object/detail',
      { id: objectId, countryCode: portal.country.toUpperCase(), languageCode: languageOf(new URL(link)) },
      link,
    );

    // A refused request says nothing about the advert, so it must not read as "withdrawn": that
    // would soft-delete every listing of this provider the first time the endpoint rate-limits us.
    if (body == null) return { active: -1, detail: null };
    if (body.responseData != null) return { active: 1, detail: body.responseData };
    // Only the endpoint's own "no such object" means withdrawn. Any other answer without a payload -
    // an error envelope, a maintenance page served as JSON - is as uninformative as a refusal, and
    // reading it as "gone" deactivated every listing it was asked about, never to be probed again.
    return { active: Number(body.responseCode) === NOT_FOUND_CODE ? 0 : -1, detail: null };
  } catch {
    return { active: -1, detail: null };
  }
}

/**
 * @param {string} link
 * @returns {Promise<number>} 1 when the advert is still up, 0 when it is gone, -1 when unknown.
 */
async function activityProbe(link) {
  return (await probeDetail(link)).active;
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

/**
 * Which country a single advert is in, for a provider serving three.
 *
 * The link is what says which site the advert is on, and it is the one thing every stored row
 * keeps: the search url belongs to the job, not to the listing, and a job's url can be pointed at
 * another country after the fact.
 *
 * @param {{link?: string|null}|null|undefined} listing
 * @returns {string|null} `de`, `at`, `ch`, or null when the link names no BETTERHOMES site.
 */
function countryOf(listing) {
  return portalOf(listing?.link)?.country ?? null;
}

/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  // The search page's own sort, and the only one of its options that puts the newest advert first.
  sortByDateParam: 'sortOrder=newestDesc',
  // Read off a search with both bounds set: ?…&priceMin=500&priceMax=1000
  priceRangeParams: { min: 'priceMin', max: 'priceMax' },
  // Not selectors: this provider reads JSON, and these are the fields of one search row. Kept for
  // the same reason the other API providers keep theirs - it is the one place the mapping is
  // written down in full.
  crawlFields: {
    id: 'uniqueKey',
    title: 'title',
    price: 'priceNet (rentals, priceGrossFloat when missing) / priceGrossFloat (sales)',
    size: 'livingSpace',
    rooms: 'rooms',
    address: 'zipcode + city',
    image: 'images[0].imageUrl',
    link: 'uniqueKey',
  },
  normalize,
  getListings,
  fetchDetails,
  activityProbe,
  priceTracking: {
    /**
     * The same figure the search list reports, read off the same endpoint through the same
     * `readPrice`: the Nettomiete for a rental, the price for a sale. Reading a different field
     * here than the list stored would report an invented change for every listing at once - which
     * is why the detail's display-text `priceNet` goes through the same parser as the list's.
     *
     * @param {{link: string}} listing
     * @returns {Promise<number|null>}
     */
    probe: async (listing) => readPrice((await probeDetail(listing?.link)).detail),
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
  // The run's search url is bound here rather than read from the module-level `config`: that
  // object's `url` is null on the static template and `createConfig` returns a copy, so the module
  // binding is never assigned. It is what says which of the three sites a listing links to.
  normalize: (o) => normalize(o, sourceConfig.url),
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});

export const metaInformation = {
  countries: ['de', 'at', 'ch'],
  countryOf,
  // One application on three domains, so a job url may name any of them. Checking a pasted url
  // against `baseUrl` alone would refuse every Austrian and Swiss search the provider can run.
  hosts: Object.keys(PORTALS),
  name: 'BETTERHOMES',
  baseUrl: `${DEFAULT_PORTAL.origin}/`,
  id: 'betterhomes',
};

export { config };
