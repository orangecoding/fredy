/**
 * ImmoScout provider using the mobile API to retrieve listings.
 *
 * The mobile API provides the following endpoints:
 * - GET /search/total?{search parameters}: Returns the total number of listings for the given query
 *   Example: `curl -H "User-Agent: ImmoScout24_1410_30_._" https://api.mobile.immobilienscout24.de/search/total?searchType=region&realestatetype=apartmentrent&pricetype=calculatedtotalrent&geocodes=%2Fde%2Fberlin%2Fberlin `
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
 *   Example: `curl -X POST 'https://api.mobile.immobilienscout24.de/search/list?pricetype=calculatedtotalrent&realestatetype=apartmentrent&searchType=region&geocodes=%2Fde%2Fberlin%2Fberlin&pagenumber=1' -H "Connection: keep-alive" -H "User-Agent: ImmoScout24_1410_30_._" -H "Accept: application/json" -H "Content-Type: application/json" -d '{"supportedResultListType": [], "userData": {}}'`

 * - GET /expose/{id} - Returns the details of a listing. The response contains additional details not included in the
 *   listing response.
 *
 *   Example: `curl -H "User-Agent: ImmoScout24_1410_30_._" "https://api.mobile.immobilienscout24.de/expose/158382494"`
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
 * Limitations:
 * - The current implementation of this provider *does not* support non-rental properties,
 *   although the same approach can be used to implement support. It's just a matter of
 *   mapping the web search URL to the corresponding mobile API URL.
 * - Pagination support is not implemented.
 */

import utils, { buildHash } from '../utils.js';
import queryString from 'query-string';
let appliedBlackList = [];

async function getListings(url) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'ImmoScout24_1410_30_._',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      supportedResultListTypes: [],
      userData: {},
    }),
  });
  if (!response.ok) {
    console.error('Error fetching data from ImmoScout Mobile API:', response.statusText);
    return [];
  }

  const responseBody = await response.json();
  return responseBody.resultListItems
    .filter((item) => item.type === 'EXPOSE_RESULT')
    .map((expose) => {
      const item = expose.item;
      const [price, size] = item.attributes;
      return {
        id: item.id,
        price: price?.value,
        size: size?.value,
        title: item.title,
        link: `${metaInformation.baseUrl}expose/${item.id}`,
        address: item.address?.line,
      };
    });
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
  return !utils.isOneOf(o.title, appliedBlackList);
}
const config = {
  url: null,
  sortByDateParam: 'sorting=-firstactivation',
  // Not actually required - used by filter to remove and listings that failed to parse
  crawlFields: {
    id: 'id',
    title: 'title',
    price: 'price',
    size: 'size',
    link: 'link',
    address: 'address',
  },
  normalize: normalize,
  filter: applyBlacklist,
  getListings: getListings,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = convertWebToMobile(sourceConfig.url);
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immoscout',
  baseUrl: 'https://www.immobilienscout24.de/',
  id: 'immoscout',
};

export function convertWebToMobile(webUrl) {
  let url;
  try {
    url = new URL(webUrl);
  } catch (err) {
    throw new Error(`Invalid URL: ${webUrl}`);
  }
  const segments = url.pathname.split('/');
  if (segments.length < 6 || segments[1] !== 'Suche') {
    throw new Error(`Unexpected path format: ${url.pathname}`);
  }
  const geocodes = `/${segments[2]}/${segments[3]}/${segments[4]}`;

  const paramNameMap = {
    heatingtypes: 'heatingtypes',
    haspromotion: 'haspromotion',
    numberofrooms: 'numberofrooms',
    livingspace: 'livingspace',
    energyefficiencyclasses: 'energyefficiencyclasses',
    exclusioncriteria: 'exclusioncriteria',
    equipment: 'equipment',
    petsallowedtypes: 'petsallowedtypes',
    price: 'price',
    constructionyear: 'constructionyear',
    apartmenttypes: 'apartmenttypes',
    pricetype: 'pricetype',
    floor: 'floor',
  };

  const equipmentValueMap = {
    parking: 'parking',
    cellar: 'cellar',
    builtinkitchen: 'builtInKitchen',
    lift: 'lift',
    garden: 'garden',
    guesttoilet: 'guestToilet',
    balcony: 'balcony',
  };

  const { query: webParams } = queryString.parseUrl(webUrl, { arrayFormat: 'comma' });
  delete webParams['enteredFrom'];

  // Remove unsupported parameters
  Object.keys(webParams).forEach((key) => {
    if (!paramNameMap[key]) {
      delete webParams[key];
    }
  });

  // Build mobile params
  const mobileParams = {
    searchType: 'region',
    geocodes,
    realestatetype: 'apartmentrent',
  };

  Object.entries(webParams).forEach(([webKey, webVal]) => {
    let value = webVal;

    if (webKey === 'equipment') {
      // Map equipment list to camelCase values
      if (!Array.isArray(value)) {
        value = ('' + value).split(',');
      }
      value = value.map((token) => {
        const lower = token.toLowerCase();
        if (!equipmentValueMap[lower]) {
          throw new Error(`Unknown equipment type: "${token}"`);
        }
        return equipmentValueMap[lower];
      });
    }

    mobileParams[paramNameMap[webKey]] = value;
  });

  const mobileQuery = queryString.stringify(mobileParams, {
    arrayFormat: 'comma',
    encode: true,
    skipEmptyString: true,
  });

  return `https://api.mobile.immobilienscout24.de/search/list?${mobileQuery}`;
}

export { config };
