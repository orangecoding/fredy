/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The ImmoScout mobile API, and the provider built on top of it.
 *
 * The mobile API provides the following endpoints:
 * - GET /search/total?{search parameters}: Returns the total number of listings for the given query
 *   Example: `curl -H "User-Agent: ImmoScout_28.1_26.5.2_._" https://api.mobile.immobilienscout24.de/search/total?searchType=region&realestatetype=apartmentrent&pricetype=calculatedtotalrent&geocodes=%2Fde%2Fberlin%2Fberlin `
 *
 * - POST /search/list?{search parameters}: Actually retrieves the listings. Body is json encoded and contains
 *   data specifying additional results (advertisements) to return. The format is as follows:
 *   ```
 *   {
 *   "supportedResultListTypes": [],
 *   "userData": {}
 *   }
 *   ```
 *   It is not necessary to provide data for the specified keys.
 *
 *   Example: `curl -X POST 'https://api.mobile.immobilienscout24.de/search/list?pricetype=calculatedtotalrent&realestatetype=apartmentrent&searchType=region&geocodes=%2Fde%2Fberlin%2Fberlin&pagenumber=1' -H "Connection: keep-alive" -H "User-Agent: ImmoScout_28.1_26.5.2_._" -H "Accept: application/json" -H "Content-Type: application/json" -d '{"supportedResultListType": [], "userData": {}}'`
 *
 * - GET /expose/{id} - Returns the details of a listing. The response contains additional details not included in the
 *   listing response.
 *
 *   Example: `curl -H "User-Agent: ImmoScout_28.1_26.5.2_._" "https://api.mobile.immobilienscout24.de/expose/158382494"`
 *
 * It is necessary to set the correct User Agent (see {@link getListings}) in the request header.
 *
 * Note that the mobile API is not publicly documented. I've reverse-engineered
 * it by intercepting traffic from an android emulator running the immoscout app.
 * Moreover, the search parameters differ slightly from the web API. I've mapped them
 * to the web API parameters by comparing a search request with all parameters set between
 * the web and mobile API. The mobile API actually seems to be a superset of the web API,
 * but I have decided not to include new parameters as I wanted to keep the existing UX (i.e.,
 * users only have to provide a link to an existing search).
 *
 * **One API, several national sites.** There is exactly one mobile API host and it answers for
 * every ImmoScout site whose listings live in the German index - Germany under `/de/...` geocodes,
 * Austria under `/at/...`. Nothing below differs between them, which is why the provider modules
 * are descriptors over this file rather than copies of it: they name a portal and hand in the
 * translator that reads its URLs, and {@link buildImmoscoutProvider} does the rest.
 *
 * Switzerland is not among them. `immoscout24.ch` belongs to a different company, runs a different
 * platform and has no listings in this index at all (`/ch/...` geocodes answer with zero results
 * or 412), so it would be a provider of its own and shares none of this.
 */

import { buildHash, isOneOf, nullOrEmpty, randomBetween, sleep } from '../../utils.js';
import { MAX_PROBE_ATTEMPTS, backoffDelay, retryAfterDelay } from '../listings/activeProbeBackoff.js';
import { convertImmoscoutListingToMobileListing } from './immoscout-web-translator.js';
import logger from '../logger.js';
import { extractNumber } from '../../utils/extract-number.js';
import { normalizeBuildYear, normalizeEnergyClass } from '../../utils/buildingFacts.js';
/** @import { ParsedListing } from '../../types/listing.js' */
/** @import { ProviderConfig, ProviderMetaInformation } from '../../types/providerConfig.js' */

/** The mobile API's own host. Not the portal a user pastes a URL from - see the file header. */
const MOBILE_API = 'https://api.mobile.immobilienscout24.de';

/**
 * Where a listing's public page lives, for every national site alike.
 *
 * Deliberately not the portal's `baseUrl`. An Austrian advert is served by the German index under
 * a German numeric id, and the exposé the API returns for it states exactly this host as its own
 * share link; the Austrian site's `/expose/<24 hex>` ids are a different identifier space and a
 * link built from them would 404.
 */
const EXPOSE_BASE_URL = 'https://www.immobilienscout24.de/';

/** The app version the search endpoint expects to be talking to. */
const SEARCH_USER_AGENT = 'ImmoScout_28.1_26.5.2_._';

/** The app version the exposé endpoint expects. */
const EXPOSE_USER_AGENT = 'ImmoScout_27.3_26.0_._';

/**
 * Fetches one page of search results.
 *
 * @param {string} url A mobile API `search/list` URL, as a translator produced it.
 * @returns {Promise<any[]>} Raw listings, or an empty array when the API refused the search.
 */
async function getListings(url) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': SEARCH_USER_AGENT,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      supportedResultListTypes: [],
      userData: {},
    }),
  });
  if (!response.ok) {
    // The mobile API answers 412 with a body naming the parameter it refused, and nothing else in
    // the pipeline ever sees that body. Without it a rejected search is indistinguishable from a
    // search that simply found nothing.
    const details = await response.text().catch(() => '');
    logger.error(
      `Error fetching data from ImmoScout Mobile API: ${response.status} ${response.statusText} ${details.slice(0, 500)}`,
    );
    return [];
  }

  const responseBody = await response.json();
  return responseBody.resultListItems
    .filter((item) => item.type === 'EXPOSE_RESULT')
    .map((expose) => {
      const item = expose.item;
      const { price, size, rooms } = readAttributes(item.attributes);
      const image = item?.titlePicture?.full ?? item?.titlePicture?.preview ?? null;
      return {
        id: item.id,
        price,
        size,
        rooms,
        title: item.title,
        link: `${EXPOSE_BASE_URL}expose/${item.id}`,
        address: item.address?.line,
        image,
      };
    });
}

/**
 * Reads a listing's headline figures out of the mobile API's `attributes` array.
 *
 * The array carries them as `[{label: '', value: '2.300 €'}, {label: '', value: '131 m²'},
 * {label: '', value: '2 Zi.'}]` - the labels are empty, so the unit in the value is the only thing
 * identifying a figure. Reading them by position instead meant the room count, which sits last, was
 * never picked up at all, and a listing without one (a plot, say) would have shifted the others.
 *
 * @param {Array<{label?: string, value?: string}>} [attributes]
 * @returns {{price: string|null, size: string|null, rooms: string|null}}
 */
function readAttributes(attributes) {
  const valueMatching = (unit) => (attributes ?? []).find((attr) => unit.test(attr?.value ?? ''))?.value ?? null;

  return {
    price: valueMatching(/€/),
    size: valueMatching(/m²/),
    // "2 Zi." on the search list, "2 Zimmer" in some responses.
    rooms: valueMatching(/\bZi(\.|mmer)?\b/i),
  };
}

/**
 * Enriches a listing with everything only its exposé carries.
 *
 * @param {ParsedListing} listing
 * @returns {Promise<ParsedListing>} The listing unchanged when the API answers with an error
 *   status. Rejects when the request itself fails or the body is not JSON - `detailRefetchService`
 *   relies on that to report the refetch as failed, so it is not caught here.
 */
async function fetchDetails(listing) {
  const exposeId = listing.link?.split('/').pop();
  const detailed = await fetch(`${MOBILE_API}/expose/${exposeId}`, {
    headers: {
      'User-Agent': EXPOSE_USER_AGENT,
      'Content-Type': 'application/json',
    },
  });
  if (!detailed.ok) {
    logger.warn(
      `Error fetching listing details from ImmoScout Mobile API for id: ${exposeId} Status: ${detailed.statusText}`,
    );
    return listing;
  }
  const detailBody = await detailed.json();

  listing.description = buildDescription(detailBody);

  // The search list occasionally omits a figure the exposé does carry, and the exposé is the more
  // precise source anyway ("131,37 m²" against the list's rounded "131 m²"). Only fills gaps, so a
  // value already read from the list is never overwritten.
  if (listing.rooms == null) {
    listing.rooms = extractNumber(findTopAttribute(detailBody, 'Zimmer'));
  }
  if (listing.size == null) {
    listing.size = extractNumber(findTopAttribute(detailBody, 'Wohnfläche'));
  }

  listing.buildYear = normalizeBuildYear(findAttribute(detailBody, 'ATTRIBUTE_LIST', 'Baujahr')?.text);
  listing.energyClass = readEnergyClass(detailBody);

  return listing;
}

/**
 * Every attribute of one section type, in page order.
 *
 * @param {any} detailBody Parsed `/expose/{id}` response.
 * @param {string} type Section type, `TOP_ATTRIBUTES` or `ATTRIBUTE_LIST`.
 * @returns {any[]}
 */
function attributesOfType(detailBody, type) {
  return (detailBody?.sections || [])
    .filter((section) => section?.type === type)
    .flatMap((section) => section.attributes || []);
}

/**
 * Reads one labelled attribute. `ATTRIBUTE_LIST` labels carry a trailing colon
 * (`{label: 'Baujahr:', text: '1950'}`) where the `TOP_ATTRIBUTES` ones do not, so the colon is
 * stripped before comparing and callers name the label without it either way.
 *
 * @param {any} detailBody Parsed `/expose/{id}` response.
 * @param {string} type Section type to look in.
 * @param {string} label Label to look for, without the colon.
 * @returns {any|null}
 */
function findAttribute(detailBody, type, label) {
  return (
    attributesOfType(detailBody, type).find((attribute) => attribute?.label?.replace(/:\s*$/, '') === label) ?? null
  );
}

/**
 * The energy efficiency class is the one attribute the API states as a picture rather than as
 * text - `.../energy-efficiency-labels/C.png` - so the file name is the only place it is written.
 *
 * @param {any} detailBody Parsed `/expose/{id}` response.
 * @returns {string|null}
 */
function readEnergyClass(detailBody) {
  // `normalizeEnergyClass` stops at the dot, so the extension needs no stripping of its own.
  return normalizeEnergyClass(
    findAttribute(detailBody, 'ATTRIBUTE_LIST', 'Energieeffizienzklasse')?.url?.split('/').pop(),
  );
}

/**
 * Reads one of the exposé's headline attributes, which - unlike the ones on the search list - are
 * labelled (`{label: 'Zimmer', text: '2'}`).
 *
 * @param {any} detailBody Parsed `/expose/{id}` response.
 * @param {string} label Exact label to look for.
 * @returns {string|null}
 */
function findTopAttribute(detailBody, label) {
  return findAttribute(detailBody, 'TOP_ATTRIBUTES', label)?.text ?? null;
}

/**
 * Builds the human readable description stored on a listing, out of the exposé's contact block,
 * its attribute list and its free text sections.
 *
 * @param {any} detailBody Parsed `/expose/{id}` response.
 * @returns {string}
 */
function buildDescription(detailBody) {
  const sections = detailBody.sections || [];
  const contact = detailBody.contact || {};
  const cData = contact?.contactData || {};
  const agentName = cData?.agent?.name || '';
  const agentCompany = cData?.agent?.company || '';
  const stars = cData?.agent?.rating?.numberOfStars || '';
  const phoneNumbers = contact?.phoneNumbers || [];
  const phoneNumbersMapped = phoneNumbers
    .map((p) => `${p.label}: ${p.text}`)
    .join('\n')
    .trim();

  const attributes = attributesOfType(detailBody, 'ATTRIBUTE_LIST')
    .filter((attr) => attr.label && attr.text)
    .map((attr) => `${attr.label} ${attr.text}`)
    .join('\n');

  const freeText = sections
    .filter((s) => s.type === 'TEXT_AREA')
    .map((s) => {
      return `${s.title}\n${s.text}`;
    })
    .join('\n\n');

  return (
    `Agent: ${agentName ? agentName : 'Unbekannt'} ${agentCompany ? `(${agentCompany}) ` : ''}${stars ? `- ${stars} stars` : ''}\n` +
    (phoneNumbersMapped ? `Phone Numbers:\n${phoneNumbersMapped}` : '') +
    '\n\n' +
    attributes.trim() +
    '\n\n' +
    freeText.trim()
  );
}

/**
 * Re-read a listing's current price from the mobile API.
 *
 * Uses the API rather than a rendered page for the same reason every other call here does: the
 * public exposé is the most aggressively bot-protected surface Immoscout has, and the API answers
 * the same question in one request.
 *
 * Parity with the search list is what makes the reading comparable, so this mirrors
 * {@link readAttributes} exactly: the first headline attribute carrying a euro figure. That is
 * Kaltmiete on a rental and Kaufpreis on a sale, which is precisely what the list column shows -
 * picking `Warmmiete` here instead would report a fabricated increase for every rental at once.
 *
 * @param {{link: string}} listing
 * @returns {Promise<string|null>} The raw price text, or null when it cannot be read.
 */
async function probePrice(listing) {
  const exposeId = listing.link?.split('/').pop();
  if (!exposeId) return null;

  const response = await fetch(`${MOBILE_API}/expose/${exposeId}`, {
    headers: {
      'User-Agent': EXPOSE_USER_AGENT,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    logger.debug(`Could not read price for Immoscout expose ${exposeId}. Status: ${response.statusText}`);
    return null;
  }

  const body = await response.json();
  const attributes = (body?.sections || [])
    .filter((section) => section?.type === 'TOP_ATTRIBUTES')
    .flatMap((section) => section.attributes || []);

  return attributes.find((attribute) => /€/.test(attribute?.text ?? ''))?.text ?? null;
}

/**
 * Check whether a stored listing is still online, by asking the same mobile API the app uses.
 *
 * Retries like the shared probe in `listingActiveTester` does, and for the same reason: the
 * alive-checker walks listings in batches, so a plain single-shot fetch here sent several requests a
 * second at one host and got HTTP 429 back for most of them. A 429 says nothing about the flat, so
 * it is retried - on the portal's own `Retry-After` where it sends one - and if it survives every
 * attempt the answer is "no answer", never "gone". Only a 404 means gone.
 *
 * @param {string} link Listing url on the website.
 * @returns {Promise<number>} 1 if active, 0 if gone, -1 if the API gave no usable answer.
 */
async function isListingActive(link) {
  const mobileLink = convertImmoscoutListingToMobileListing(link);
  if (mobileLink == null) {
    logger.warn('Cannot check immoscout listing without a link', link);
    return -1;
  }

  await sleep(randomBetween(50, 100));

  for (let attempt = 1; attempt <= MAX_PROBE_ATTEMPTS; attempt++) {
    try {
      const result = await fetch(mobileLink, {
        headers: {
          'User-Agent': SEARCH_USER_AGENT,
        },
      });

      if (result.status === 200) {
        return 1;
      }

      if (result.status === 404) {
        return 0;
      }

      if (attempt < MAX_PROBE_ATTEMPTS) {
        await sleep(result.status === 429 ? retryAfterDelay(result, attempt) : backoffDelay(attempt));
        continue;
      }

      logger.warn('Unknown status for immoscout listing', link, result.status);
      return -1;
    } catch (error) {
      if (attempt < MAX_PROBE_ATTEMPTS) {
        await sleep(backoffDelay(attempt));
        continue;
      }

      logger.warn('Could not reach immoscout for listing', link, error?.message);
      return -1;
    }
  }

  return -1;
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const title = (o.title || '').replace('NEU', '').trim();
  // The Austrian feed marks an address without a street "(unvollständige Adresse)". Kept, the marker
  // went into every notification and cost each address a failed geocode before the fallback without
  // it succeeded.
  const address = nullOrEmpty(o.address)
    ? 'NO ADDRESS FOUND'
    : (o.address || '')
        .replace(/\(.*\),.*$/, '')
        .replace(/\s*\(unvollständige Adresse\)\s*$/i, '')
        .trim();
  const id = buildHash(o.id, o.price);
  return {
    id,
    link: o.link,
    title,
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address,
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

/**
 * A `min-max` range as ImmoScout spells it, with either side allowed to be empty.
 *
 * `10.0-100.0`, `-600000.0` (no lower bound) and `240.0-` (no upper one) are all valid, and values
 * may be written in scientific notation - the web UI emits `price=1.0-1.0E7` for a slider pushed to
 * both ends. The leading `-` of `-600000.0` is an empty lower bound and not a negative number,
 * which is why the two halves are matched rather than the string split on the first dash.
 */
const RANGE_PATTERN = /^([^-]*)-([^-]*)$/;

/**
 * One national site of ImmoScout, as a provider module declares it.
 *
 * @typedef {Object} ImmoscoutPortal
 * @property {string} id Provider id, stored on every listing it finds.
 * @property {string} name Display name in the UI.
 * @property {string} baseUrl The portal a user pastes a search URL from, and what the job form links to. Not where listings live - see {@link EXPOSE_BASE_URL}.
 * @property {string[]} countries ISO 3166-1 alpha-2 codes this portal serves.
 * @property {(webUrl: string) => string} toMobileSearchUrl Reads this portal's search URLs. The one thing that genuinely differs between national sites.
 */

/**
 * Builds a provider module's three exports for one national ImmoScout site.
 *
 * A portal contributes its identity and a translator, and nothing else: every request, every
 * parser and every probe in this file is the same for all of them, because they are all answered by
 * one API off one index. Adding a site is therefore a descriptor, not a copy - which is the point,
 * given how much reverse-engineered knowledge a second copy would have to be kept in step with.
 *
 * `countryOf` is deliberately not part of this. Each portal declares a single country, so there is
 * nothing to narrow per listing, and a listing could not be narrowed anyway: the API hands back one
 * identifier space for all of them, so an Austrian advert's link is indistinguishable from a German
 * one's. One provider per national site is what keeps the answer knowable.
 *
 * @param {ImmoscoutPortal} portal
 * @returns {{metaInformation: ProviderMetaInformation, config: ProviderConfig, createConfig: (sourceConfig: {url: string, enabled?: boolean}, blacklist?: string[]) => ProviderConfig}}
 */
export function buildImmoscoutProvider(portal) {
  /**
   * The price range of a search on this portal.
   *
   * ImmoScout hides the price in several places: the `price` query parameter, the SEO path segments
   * (`guenstige-wohnung-mieten` means "up to 400 €", `wohnung-bis-800-euro-warm` means what it
   * says) and the per-type defaults. The portal's translator already resolves all of them in the
   * site's own precedence order, so reading its output is both less code than doing it again and
   * guaranteed to describe the search Fredy actually runs.
   *
   * Note that `pricetype` decides whether the bounds are Kaltmiete or Warmmiete. It is not reported
   * - see the tracking payload - so two searches with the same numbers and different price types
   * look alike from the outside.
   *
   * @param {string} url The job's search url, as copied from the website.
   * @returns {{min: string|null, max: string|null}}
   */
  function parsePriceRange(url) {
    const price = new URL(portal.toMobileSearchUrl(url)).searchParams.get('price');
    const match = price == null ? null : RANGE_PATTERN.exec(price);
    return match == null ? { min: null, max: null } : { min: match[1], max: match[2] };
  }

  /** @type {ProviderConfig} */
  const config = {
    requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
    url: null,
    crawlFields: {
      id: 'id',
      title: 'title',
      price: 'price',
      size: 'size',
      rooms: 'rooms',
      link: 'link',
      address: 'address',
    },
    // Not required - used by filter to remove and listings that failed to parse
    sortByDateParam: 'sorting=-firstactivation',
    priceRangeParams: { parse: parsePriceRange },
    normalize: normalize,
    getListings: getListings,
    fetchDetails: fetchDetails,
    activityProbe: isListingActive,
    priceTracking: { probe: probePrice },
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
  const createConfig = (sourceConfig, blacklist = []) => ({
    ...config,
    enabled: sourceConfig.enabled,
    url: portal.toMobileSearchUrl(sourceConfig.url),
    filter: (listing) => applyBlacklist(listing, blacklist ?? []),
  });

  /** @type {ProviderMetaInformation} */
  const metaInformation = {
    countries: portal.countries,
    name: portal.name,
    baseUrl: portal.baseUrl,
    id: portal.id,
  };

  return { metaInformation, config, createConfig };
}
