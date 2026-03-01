/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * ImmoScout provider using the mobile API to retrieve listings.
 *
 * The mobile API provides the following endpoints:
 * - GET /search/total?{search parameters}: Returns the total number of listings for the given query
 *   Example: `curl -H "User-Agent: ImmoScout_27.12_26.2_._" https://api.mobile.immobilienscout24.de/search/total?searchType=region&realestatetype=apartmentrent&pricetype=calculatedtotalrent&geocodes=%2Fde%2Fberlin%2Fberlin `
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
 *   Example: `curl -X POST 'https://api.mobile.immobilienscout24.de/search/list?pricetype=calculatedtotalrent&realestatetype=apartmentrent&searchType=region&geocodes=%2Fde%2Fberlin%2Fberlin&pagenumber=1' -H "Connection: keep-alive" -H "User-Agent: ImmoScout_27.12_26.2_._" -H "Accept: application/json" -H "Content-Type: application/json" -d '{"supportedResultListType": [], "userData": {}}'`

 * - GET /expose/{id} - Returns the details of a listing. The response contains additional details not included in the
 *   listing response.
 *
 *   Example: `curl -H "User-Agent: ImmoScout_27.12_26.2_._" "https://api.mobile.immobilienscout24.de/expose/158382494"`
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
let appliedBlackList = [];
let fetchDetails = false;

async function getListings(url) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'ImmoScout_27.12_26.2_._',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      supportedResultListTypes: [],
      userData: {},
    }),
  });
  if (!response.ok) {
    logger.error('Error fetching data from ImmoScout Mobile API:', response.statusText);
    return [];
  }

  const responseBody = await response.json();
  return Promise.all(
    responseBody.resultListItems
      .filter((item) => item.type === 'EXPOSE_RESULT')
      .map(async (expose) => {
        const item = expose.item;
        const [price, size] = item.attributes;
        const image = item?.titlePicture?.full ?? item?.titlePicture?.preview ?? null;
        let listing = {
          id: item.id,
          price: price?.value,
          size: size?.value,
          title: item.title,
          link: `${metaInformation.baseUrl}expose/${item.id}`,
          address: item.address?.line,
          image,
        };
        if (fetchDetails) {
          return await pushDetails(listing);
        }
        return listing;
      }),
  );
}

async function pushDetails(listing) {
  const detailed = await fetch(`https://api.mobile.immobilienscout24.de/expose/${listing.id}`, {
    headers: {
      'User-Agent': 'ImmoScout_27.3_26.0_._',
      'Content-Type': 'application/json',
    },
  });
  if (!detailed.ok) {
    logger.error('Error fetching listing details from ImmoScout Mobile API:', detailed.statusText);
    return listing;
  }
  const detailBody = await detailed.json();

  listing.description = buildDescription(detailBody);

  return listing;
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

  const attributes = sections
    .filter((s) => s.type === 'ATTRIBUTE_LIST')
    .flatMap((s) => s.attributes)
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

async function isListingActive(link) {
  const result = await fetch(convertImmoscoutListingToMobileListing(link), {
    headers: {
      'User-Agent': 'ImmoScout_27.12_26.2_._',
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
function normalize(o) {
  const title = nullOrEmpty(o.title) ? 'NO TITLE FOUND' : o.title.replace('NEU', '');
  const address = nullOrEmpty(o.address) ? 'NO ADDRESS FOUND' : (o.address || '').replace(/\(.*\),.*$/, '').trim();
  const id = buildHash(o.id, o.price);
  return Object.assign(o, { id, title, address });
}
function applyBlacklist(o) {
  return !isOneOf(o.title, appliedBlackList);
}
const config = {
  url: null,
  crawlFields: {
    id: 'id',
    title: 'title',
    price: 'price',
    size: 'size',
    link: 'link',
    address: 'address',
  },
  // Not required - used by filter to remove and listings that failed to parse
  sortByDateParam: 'sorting=-firstactivation',
  normalize: normalize,
  filter: applyBlacklist,
  getListings: getListings,
  activeTester: isListingActive,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = convertWebToMobile(sourceConfig.url);
  appliedBlackList = blacklist || [];
  fetchDetails = false;
};

/**
 * Enable or disable fetching detailed listing data from the expose API.
 * This creates additional API requests per listing and increases the risk of being rate-limited.
 * @param {boolean} enabled
 */
export const setFetchDetails = (enabled) => {
  fetchDetails = !!enabled;
};
export const metaInformation = {
  name: 'Immoscout',
  baseUrl: 'https://www.immobilienscout24.de/',
  id: 'immoscout',
};

export { config };
