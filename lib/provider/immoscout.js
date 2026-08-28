/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * ImmoScout provider using the mobile API to retrieve listings.
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

 * - GET /expose/{id} - Returns the details of a listing. The response contains additional details not included in the
 *   listing response.
 *
 *   Example: `curl -H "User-Agent: ImmoScout_28.1_26.5.2_._" "https://api.mobile.immobilienscout24.de/expose/158382494"`
 *
 *
 * It is necessary to set the correct User Agent (see `getListings`) in the request header.
 *
 * Note that the mobile API is not publicly documented. I've reverse-engineered
 * it by intercepting traffic from an android emulator running the immoscout app.
 * Moreover, the search parameters differ slightly from the web API. I've mapped them
 * to the web API parameters by comparing a search request with all parameters set between
 * the web and mobile API. The mobile API actually seems to be a superset of the web API,
 * but I have decided not to include new parameters as I wanted to keep the existing UX (i.e.,
 * users only have to provide a link to an existing search).
 *
 */

import { buildHash, isOneOf } from '../utils.js';
import {
  convertImmoscoutListingToMobileListing,
  convertWebToMobile,
} from '../services/immoscout/immoscout-web-translator.js';
import logger from '../services/logger.js';
import { extractNumber } from '../utils/extract-number.js';
import { normalizeBuildYear, normalizeEnergyClass } from '../utils/buildingFacts.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

async function getListings(url) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'ImmoScout_28.1_26.5.2_._',
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
        link: `${metaInformation.baseUrl}expose/${item.id}`,
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

async function fetchDetails(listing) {
  return pushDetails(listing);
}

async function pushDetails(listing) {
  const exposeId = listing.link?.split('/').pop();
  const detailed = await fetch(`https://api.mobile.immobilienscout24.de/expose/${exposeId}`, {
    headers: {
      'User-Agent': 'ImmoScout_27.3_26.0_._',
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

  const response = await fetch(`https://api.mobile.immobilienscout24.de/expose/${exposeId}`, {
    headers: {
      'User-Agent': 'ImmoScout_27.3_26.0_._',
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

async function isListingActive(link) {
  const result = await fetch(convertImmoscoutListingToMobileListing(link), {
    headers: {
      'User-Agent': 'ImmoScout_28.1_26.5.2_._',
    },
  });

  if (result.status === 200) {
    return 1;
  }

  if (result.status === 404) {
    return 0;
  }

  logger.warn('Unknown status for immoscout listing', link);
  return -1;
}

function nullOrEmpty(val) {
  return val == null || val.length === 0;
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const title = (o.title || '').replace('NEU', '').trim();
  const address = nullOrEmpty(o.address) ? 'NO ADDRESS FOUND' : (o.address || '').replace(/\(.*\),.*$/, '').trim();
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
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: convertWebToMobile(sourceConfig.url),
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});
export const metaInformation = {
  countries: ['de'],
  name: 'Immoscout',
  baseUrl: 'https://www.immobilienscout24.de/',
  id: 'immoscout',
};

export { config };
