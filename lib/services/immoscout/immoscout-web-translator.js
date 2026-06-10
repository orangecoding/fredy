/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
Rent a flat
Web:
https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/wohnung-mieten?numberofrooms=1.0-10000.0&price=1.0-10000.0&livingspace=10.0-10000.0&pricetype=rentpermonth&enteredFrom=result_list
*/

/*
Rent a flat:
Web:
https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/wohnung-mieten?enteredFrom=one_step_search
Mobile:
https://api.mobile.immobilienscout24.de/search/list?numberofrooms=1.5-&searchId=d7c127d8-6630-49e8-a1dd-5ae04dad454d&sorting=standard&pagesize=20&livingspace=10-500&pagenumber=1&realestatetype=apartmentrent&priceType=calculatedtotalrent&price=1-10000&publishedafter=2025-05-14T09:11:54&channel=is24&searchType=region&geocodes=/de/nordrhein-westfalen/duesseldorf&features=adKeysAndStringValues,virtualTour,contactDetails,viareporting,nextgen,calculatedTotalRent,listingsInListFirstSummary,xxlListingType,quickfilters,grouping,projectsInAllRealestateTypes,fairPrice
*/

/*
Rent a house:
Web:
https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/haus-mieten?enteredFrom=one_step_search
Mobile:
https://api.mobile.immobilienscout24.de/search/map/v3?publishedafter=2025-05-14T09:12:49&pagenumber=1&searchType=region&geocodes=/de/nordrhein-westfalen/duesseldorf&realEstateType=houserent&pagesize=300&features=disableNHBGrouping,nextGen,fairPrice,listingsInListFirstSummary,xxlListingType,contactDetails&sorting=standard
*/

/*
 buy a flat
 Web:
 https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/wohnung-kaufen?numberofrooms=1.0-10000.0&price=1.0-10000.0&livingspace=1.0-10000.0&enteredFrom=result_list
 Mobile:
 https://api.mobile.immobilienscout24.de/search/map/v3?features=disableNHBGrouping,nextGen,fairPrice,listingsInListFirstSummary,xxlListingType,contactDetails&sorting=standard&realEstateType=apartmentbuy&pagesize=300&pagenumber=1&geocodes=/de/nordrhein-westfalen/duesseldorf&publishedafter=2025-05-14T09:14:43&searchType=region
 */

/*
 Buy a house
 Web:
 https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/haus-kaufen?numberofrooms=1.0-10000.0&price=1.0-10000.0E7&livingspace=1.0-10000.0&enteredFrom=result_list
 Mobile:
 https://api.mobile.immobilienscout24.de/search/map/v3?geocodes=/de/nordrhein-westfalen/duesseldorf&features=disableNHBGrouping,nextGen,fairPrice,listingsInListFirstSummary,xxlListingType,contactDetails&searchType=region&realEstateType=housebuy&pagenumber=1&pagesize=300&sorting=standard&publishedafter=2025-05-14T09:16:28
 */

/*
 Buy a house only in parts of a city
 Web:
 https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/haus-kaufen?numberofrooms=1.0-10000.0&price=1.0-10000.0E7&livingspace=1.0-10000.0&geocodes=1276010037,1276010014,1276010012&enteredFrom=result_list
 Mobile:
 https://api.mobile.immobilienscout24.de/search/list?pagesize=20&pagenumber=1&features=adKeysAndStringValues,virtualTour,contactDetails,viareporting,grouping,nextgen,listingsInListFirstSummary,xxlListingType,quickfilters,fairPrice&sorting=standard&channel=is24&geocodes=/de/nordrhein-westfalen/duesseldorf/stadtbezirk-1&searchType=region&realestatetype=housebuy&publishedafter=2025-05-14T09:17:23
 */

/*
 Buy a house with radius
 Web:
 https://www.immobilienscout24.de/Suche/radius/haus-kaufen?centerofsearchaddress=D%C3%BCsseldorf%3B%3B%3B%3B%3B%3B&numberofrooms=1.0-10000.0&price=1.0-1.0E7&livingspace=1.0-10000.0&geocoordinates=51.22496%3B6.77567%3B5.0&enteredFrom=result_list
 Mobile:
 https://api.mobile.immobilienscout24.de/home/search/total?pagenumber=1&pagesize=1&geocoordinates=51.224960;6.775670;4.0&sorting=standard&searchType=radius&features=adKeysAndStringValues,virtualTour,contactDetails,grouping,nextgen,listingsInListFirstSummary,xxlListingType,fairPrice&channel=is24&realestatetype=housebuy&publishedafter=2025-05-14T09:19:43
 */

/*
 Buy a house with shape
 Web:
 https://www.immobilienscout24.de/Suche/shape/haus-kaufen?shape=eW1yd0hpZGloQGBJa1NfQWFsQG9Uc1ZvVmlDbHdAZ2BAaEBjfEB5U3NWY2NCa0RvWmpwQG1KYGdCeldqU3Z4QGBAbENvQmJWaGtA&numberofrooms=1.0-100000.0&price=1.0-1.0E7&livingspace=1.0-100000.0&enteredFrom=result_list#/
 Mobile:
 https://api.mobile.immobilienscout24.de/search/map/v3?features=disableNHBGrouping,nextGen,fairPrice,listingsInListFirstSummary,xxlListingType,contactDetails&publishedafter=2025-05-14T09:19:43&sorting=standard&pagesize=300&searchType=shape&realEstateType=housebuy&pagenumber=1&shape=%7D%7BjwHy%7Cqh@jCKdCgAvB_BdB%7DBzAaCjAqCfAqC~@uCt@iCh@eCZkCLyC?_EO%7DEa@%7DEa@iE_@%7BD%5DaDe@gDi@gDo@uCu@kBcB_AeDOiE?iDCgCMuBOkDCkG?yFRgD%60@cB%5C%7BA%60@eBx@aB%7C@kAbAy@rAe@bBUxCAhE?dFh@fGlAzGbBbHlBxGdB%60FrAhDz@xBh@nAf@l@RNNXkCkMJR~B%7CEnCpErCnDtClCvC~ApCh@rCJpC?
 */
import queryString from 'query-string';
import { nullOrEmpty } from '../../utils.js';

const PARAM_NAME_MAP = {
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
  buildingtypes: 'buildingtypes',
  ground: 'ground',
  pricetype: 'pricetype',
  floor: 'floor',
  geocodes: 'geocodes',
  geocoordinates: 'geocoordinates',
  shape: 'shape',
  sorting: 'sorting',
  newbuilding: 'newbuilding',
  fulltext: 'fulltext',
};

const EQUIPMENT_MAP = {
  parking: 'parking',
  cellar: 'cellar',
  builtinkitchen: 'builtInKitchen',
  lift: 'lift',
  garden: 'garden',
  guesttoilet: 'guestToilet',
  balcony: 'balcony',
  handicappedaccessible: 'handicappedAccessible',
  lodgerflat: 'lodgerflat',
};

// The web UI uses "swapflat", but the mobile API only understands "swap_flat".
// An unknown value is not ignored: the API silently returns 0 results for the
// whole search. Other values (e.g. "projectlisting") are identical on both APIs.
const EXCLUSION_CRITERIA_MAP = {
  swapflat: 'swap_flat',
};

const REAL_ESTATE_TYPE = {
  'haus-mieten': 'houserent',
  'wohnung-mieten': 'apartmentrent',
  'wohnung-kaufen': 'apartmentbuy',
  'wohnung-kaufen-mit-balkon': 'apartmentbuy',
  'eigentumswohnung-mit-garten': 'apartmentbuy',
  'haus-kaufen': 'housebuy',
  'haus-mit-keller-kaufen': 'housebuy',
  'luxushaus-kaufen': 'housebuy',
  'villa-kaufen': 'housebuy',
  'neubauhaus-kaufen': 'housebuy',
};

const WEB_PATH_TO_APARTMENT_EQUIPMENT_MAP = {
  // Category "Balkon/Terrasse"
  'wohnung-mit-balkon-mieten': { equipment: ['balcony'] },
  'wohnung-kaufen-mit-balkon': { equipment: ['balcony'] },
  'wohnung-mit-garten-mieten': { equipment: ['garden'] },
  'eigentumswohnung-mit-garten': { equipment: ['garden'] },
  // Category "Wohnungstyp"
  'souterrainwohnung-mieten': { apartmenttypes: ['halfbasement'] },
  'erdgeschosswohnung-mieten': { apartmenttypes: ['groundfloor'] },
  'hochparterrewohnung-mieten': { apartmenttypes: ['raisedgroundfloor'] },
  'etagenwohnung-mieten': { apartmenttypes: ['apartment'] },
  'loft-mieten': { apartmenttypes: ['loft'] },
  'maisonette-mieten': { apartmenttypes: ['maisonette'] },
  'terrassenwohnung-mieten': { apartmenttypes: ['terracedflat'] },
  'penthouse-mieten': { apartmenttypes: ['penthouse'] },
  'dachgeschosswohnung-mieten': { apartmenttypes: ['roofstorey'] },
  // Category "Ausstattung"
  'wohnung-mit-garage-mieten': { equipment: ['parking'] },
  'wohnung-mit-einbaukueche-mieten': { equipment: ['builtinkitchen'] },
  'wohnung-mit-keller-mieten': { equipment: ['cellar'] },
  // Category "Merkmale"
  'neubauwohnung-mieten': { newbuilding: true },
  'barrierefreie-wohnung-mieten': { equipment: ['handicappedaccessible'] },
};

// SEO-optimized rental paths used by the ImmoScout web UI when the user
// configures a maximum warmrent. Example: "wohnung-bis-800-euro-warm" means
// "apartment for rent up to 800 EUR warmrent". The web UI generates these
// paths instead of explicit `price` / `pricetype` query parameters.
// Note: only the warmrent variant uses an SEO slug; max coldrent searches
// use the regular "wohnung-mieten" path with explicit `price` and
// `pricetype=rentpermonth` query params, which the existing translator
// already handles.
const SEO_RENT_TYPE_TO_REAL_ESTATE_TYPE = {
  wohnung: 'apartmentrent',
  haus: 'houserent',
};
const SEO_MAX_WARMRENT_PATH_PATTERN = /^(?<type>wohnung|haus)-bis-(?<price>\d+)-euro-warm$/;

/**
 * Parses SEO-optimized ImmoScout web paths that encode a maximum warmrent, such
 * as "wohnung-bis-800-euro-warm". Returns the corresponding mobile API real
 * estate type and the implicit price/pricetype parameters, or null if the path
 * does not match the known SEO max-warmrent pattern.
 *
 * @param {string} realTypeKey The last segment of the URL path.
 * @returns {{ realType: string, additionalParams: Record<string, string> } | null}
 */
function parseSeoMaxWarmrentPath(realTypeKey) {
  const match = realTypeKey.match(SEO_MAX_WARMRENT_PATH_PATTERN);
  if (!match) return null;

  const { type, price } = match.groups;
  return {
    realType: SEO_RENT_TYPE_TO_REAL_ESTATE_TYPE[type],
    additionalParams: {
      price: `-${price}`,
      pricetype: 'calculatedtotalrent',
    },
  };
}

export function convertWebToMobile(webUrl) {
  let url;
  try {
    url = new URL(webUrl);
  } catch {
    throw new Error(`Invalid URL: ${webUrl}`);
  }

  const segments = url.pathname.split('/');
  if (segments[1] !== 'Suche') {
    throw new Error(`Unexpected path format: ${url.pathname}. We're expecting to see "/Suche" in the path.`);
  }

  const realTypeKey = segments.at(-1);
  let realType = REAL_ESTATE_TYPE[realTypeKey];
  let additionalParamsFromWebPath = WEB_PATH_TO_APARTMENT_EQUIPMENT_MAP[realTypeKey] || null;

  if (!realType) {
    // Test for seo optimized apartment path (only used on the ImmoScout web app)
    if (WEB_PATH_TO_APARTMENT_EQUIPMENT_MAP[realTypeKey]) {
      additionalParamsFromWebPath = WEB_PATH_TO_APARTMENT_EQUIPMENT_MAP[realTypeKey];
      realType = REAL_ESTATE_TYPE['wohnung-mieten'];
    } else {
      // Test for SEO max-warmrent path, e.g. "wohnung-bis-800-euro-warm"
      const seoMaxWarmrent = parseSeoMaxWarmrentPath(realTypeKey);
      if (seoMaxWarmrent) {
        realType = seoMaxWarmrent.realType;
        additionalParamsFromWebPath = seoMaxWarmrent.additionalParams;
      } else {
        throw new Error(`Real estate type not found: ${realTypeKey}`);
      }
    }
  }

  const { query: rawParams } = queryString.parseUrl(webUrl, { arrayFormat: 'comma' });
  const webParams = Object.fromEntries(
    Object.entries(rawParams).filter(([key]) => key !== 'enteredFrom' && PARAM_NAME_MAP[key]),
  );

  const geocodes = `/${segments.slice(2, segments.length - 1).join('/')}`;
  const isRadius = segments.includes('radius');
  const isShape = segments.includes('shape');
  const mobileParams = {
    searchType: isRadius ? 'radius' : isShape ? 'shape' : 'region',
    realestatetype: realType,
    ...(isRadius || isShape ? {} : { geocodes }),
    ...additionalParamsFromWebPath,
  };

  if (isShape && !webParams.shape) {
    throw new Error('Shape search URL is missing the required "shape" query parameter');
  }

  if (isShape && webParams.shape) {
    const browserShape = webParams.shape;
    const normalized = browserShape.replace(/\.\./g, '==').replace(/\./g, '=');
    const polyline = Buffer.from(normalized, 'base64').toString('utf-8');
    mobileParams.shape = polyline;
  }

  if (webParams.geocoordinates) {
    mobileParams.geocoordinates = webParams.geocoordinates;
  }

  for (const [key, val] of Object.entries(webParams)) {
    if (key === 'shape') continue;
    if (key === 'equipment') {
      const items = [].concat(val).flatMap((v) => `${v}`.split(','));
      const currentEquipmentParams = mobileParams[PARAM_NAME_MAP[key]];
      mobileParams[PARAM_NAME_MAP[key]] = [
        ...(currentEquipmentParams ?? []),
        ...items.map((item) => EQUIPMENT_MAP[item.toLowerCase()]).filter(Boolean),
      ];
    } else if (key === 'exclusioncriteria') {
      const items = [].concat(val).flatMap((v) => `${v}`.split(','));
      mobileParams[PARAM_NAME_MAP[key]] = items.map((item) => EXCLUSION_CRITERIA_MAP[item.toLowerCase()] ?? item);
    } else {
      mobileParams[PARAM_NAME_MAP[key]] = val;
    }
  }

  const mobileQuery = queryString.stringify(mobileParams, {
    arrayFormat: 'comma',
    encode: true,
    skipEmptyString: true,
  });

  return `https://api.mobile.immobilienscout24.de/search/list?${mobileQuery}`;
}

export function convertImmoscoutListingToMobileListing(url) {
  if (nullOrEmpty(url)) {
    return null;
  }

  return url.replace(
    /^https:\/\/www\.immobilienscout24\.de\/expose\//,
    'https://api.mobile.immobilienscout24.de/expose/',
  );
}
