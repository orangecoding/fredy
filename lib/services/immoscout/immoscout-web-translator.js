/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Translates an ImmoScout **web** search URL - the thing a user copies out of their browser - into
 * the **mobile** API search URL Fredy actually queries.
 *
 * ```
 * https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/haus-mit-garage-kaufen?price=-600000.0
 * -> https://api.mobile.immobilienscout24.de/search/list?equipment=parking&geocodes=%2Fde%2Fnordrhein-westfalen%2Fduesseldorf&price=-600000.0&realestatetype=housebuy&searchType=region
 *
 * https://www.immobilienscout24.at/regional/wien/wien/wohnung-mieten?primaryPriceTo=1200
 * -> https://api.mobile.immobilienscout24.de/search/list?exclusioncriteria=swapflat&geocodes=%2Fat%2Fwien%2Fwien&price=-1200.0&realestatetype=apartmentrent&searchType=region
 * ```
 *
 * Both national sites answer from the same mobile API - Austrian listings are syndicated into the
 * German index under an `/at/...` geocode - so the two translations differ only in how they read a
 * URL, never in what they produce. {@link buildMobileSearchUrl} is that shared tail.
 *
 * The knowledge the translation needs sits in the modules next to this one, each with its own
 * tests, so that extending it means touching one table:
 *
 * - `./web-paths.js` - what a German path segment means, since the web UI hides single filters in
 *   the path
 * - `./at-paths.js` - the same for the Austrian site, plus its own query parameter vocabulary
 * - `./param-support.js` - which parameter the mobile API accepts for which real estate type
 * - `./shape.js` - the `shape` parameter of a drawn search area
 *
 * This module is left with assembling a URL out of them: resolve the path, work out where the
 * search is anchored, apply the parameters in precedence order.
 *
 * See `reverse-engineered-immoscout.md` for how the tables were recorded off ImmoScout itself.
 */

import queryString from 'query-string';
import { nullOrEmpty } from '../../utils.js';
import {
  AT_SEARCH_SEGMENT,
  ambiguousAlternativesFor,
  COMMERCIAL_SLUGS,
  UNSERVED_AT_SLUGS,
  resolveAtPath,
  splitAtPath,
  toGeocode,
  translateAtQueryParams,
} from './at-paths.js';
import { keepSupported } from './param-support.js';
import { toPolyline } from './shape.js';
import { defaultParamsFor, resolveWebPath } from './web-paths.js';

export { listKnownWebPaths } from './web-paths.js';
export { listKnownAtPaths } from './at-paths.js';

/** Where every national site's searches are actually answered. */
const MOBILE_SEARCH_ENDPOINT = 'https://api.mobile.immobilienscout24.de/search/list';

/** The path segment the German site anchors a search under. */
const DE_SEARCH_SEGMENT = 'Suche';

/**
 * Parameters the mobile API takes but that describe *where* to search rather than *what*. They are
 * assembled from the path and the URL's geometry, so they never travel the generic parameter route.
 */
const LOCATION_PARAMS = ['geocodes', 'geocoordinates', 'shape'];

/**
 * Where the search is anchored. `radius` and `shape` searches carry their geometry in the query
 * string; a region search names its geocode in the path.
 *
 * @param {string[]} segments Path segments of the web URL.
 * @param {Record<string, unknown>} webParams The URL's query parameters.
 * @returns {{ searchType: string } & Record<string, unknown>}
 * @throws {Error} If a shape search carries no shape.
 */
function toLocation(segments, webParams) {
  if (segments.includes('radius')) {
    return { searchType: 'radius', geocoordinates: webParams.geocoordinates };
  }

  if (segments.includes('shape')) {
    if (!webParams.shape) {
      throw new Error('Shape search URL is missing the required "shape" query parameter');
    }
    const shape = Array.isArray(webParams.shape) ? webParams.shape[0] : webParams.shape;
    return { searchType: 'shape', shape: toPolyline(shape) };
  }

  // A region search names its area in the path, unless the user narrowed it down to single
  // districts - those arrive as numeric geocodes in the query string and replace the path's area.
  return {
    searchType: 'region',
    geocodes: webParams.geocodes ?? `/${segments.slice(2, segments.length - 1).join('/')}`,
  };
}

/**
 * Assembles the mobile API URL both national translations end at.
 *
 * @param {string|string[]} realType The resolved real estate type, or types.
 * @param {Record<string, unknown>} location Where to search, from {@link toLocation} or a geocode.
 * @param {Record<string, unknown>} searchParams The filters, already vetted by `keepSupported`.
 * @returns {string} The mobile API `search/list` URL.
 */
function buildMobileSearchUrl(realType, location, searchParams) {
  const mobileQuery = queryString.stringify(
    { realestatetype: realType, ...location, ...searchParams },
    { arrayFormat: 'comma', encode: true, skipEmptyString: true },
  );

  return `${MOBILE_SEARCH_ENDPOINT}?${mobileQuery}`;
}

/**
 * Parses a URL, naming it in the error the way the caller wrote it.
 *
 * @param {string} webUrl
 * @returns {URL}
 * @throws {Error} If the URL is malformed.
 */
function parseUrl(webUrl) {
  try {
    return new URL(webUrl);
  } catch {
    throw new Error(`Invalid URL: ${webUrl}`);
  }
}

/**
 * Converts an ImmoScout **Germany** web search URL into the mobile API search URL for the same
 * search.
 *
 * @param {string} webUrl A URL copied out of the ImmoScout website.
 * @returns {string} The mobile API `search/list` URL.
 * @throws {Error} If the URL is malformed, is not a search URL, or names a search we cannot map.
 */
export function convertWebToMobile(webUrl) {
  const url = parseUrl(webUrl);

  const segments = url.pathname.split('/');
  if (segments[1] !== DE_SEARCH_SEGMENT) {
    throw new Error(`Unexpected path format: ${url.pathname}. We're expecting to see "/Suche" in the path.`);
  }

  const realTypeKey = segments.at(-1);
  const webPath = resolveWebPath(realTypeKey);
  if (webPath == null) {
    throw new Error(`Real estate type not found: ${realTypeKey}`);
  }

  const { realType, params: pathParams, defaults } = webPath;
  const { query: rawParams } = queryString.parseUrl(webUrl, { arrayFormat: 'comma' });
  const queryParams = Object.fromEntries(
    Object.entries(rawParams).filter(([param]) => !LOCATION_PARAMS.includes(param)),
  );

  // Later sources win, exactly as on the website: an explicit query parameter replaces what the
  // path implied, and the path in turn replaces the type's default.
  const searchParams = {
    ...(defaults ?? defaultParamsFor(realType)),
    ...keepSupported(pathParams, realType, 'path filter'),
    ...keepSupported(queryParams, realType, 'query parameter'),
  };

  return buildMobileSearchUrl(realType, toLocation(segments, rawParams), searchParams);
}

/**
 * Converts an ImmoScout **Austria** web search URL into the mobile API search URL for the same
 * search.
 *
 * The Austrian site is a separate web application, so almost nothing about reading its URLs is
 * shared with the German one: the anchor segment is `regional` rather than `Suche`, the country is
 * not in the path, the area goes two levels deep instead of three, and the filters are stated in a
 * query vocabulary of the site's own. What comes out the other end is the same mobile API URL,
 * because the same index answers both.
 *
 * @param {string} webUrl A URL copied out of the Austrian ImmoScout website.
 * @returns {string} The mobile API `search/list` URL.
 * @throws {Error} If the URL is malformed, is not a search URL, or names a search we cannot map.
 */
export function convertAtWebToMobile(webUrl) {
  const url = parseUrl(webUrl);

  const segments = url.pathname.split('/');
  if (segments[1] !== AT_SEARCH_SEGMENT) {
    throw new Error(`Unexpected path format: ${url.pathname}. We're expecting to see "/regional" in the path.`);
  }

  const { area, slug } = splitAtPath(segments);
  if (slug == null) {
    throw new Error(
      `Unexpected path format: ${url.pathname}. We're expecting an area and a property type, as in "/regional/wien/wien/wohnung-mieten".`,
    );
  }

  if (COMMERCIAL_SLUGS.has(slug)) {
    throw new Error(
      `Commercial searches are not supported: "${slug}". The mobile API returns no readable results for offices, shops or industrial property.`,
    );
  }

  if (UNSERVED_AT_SLUGS.has(slug)) {
    throw new Error(
      `"${slug}" is not supported: the ImmoScout API has no Austrian listings of this type, so the search would never find anything.`,
    );
  }

  const alternatives = ambiguousAlternativesFor(slug);
  if (alternatives != null) {
    throw new Error(
      `"${slug}" searches renting and buying at once, which the ImmoScout API cannot do - it silently answers with the first of the two. Use ${alternatives.map((alternative) => `"${alternative}"`).join(' or ')} instead.`,
    );
  }

  const atPath = resolveAtPath(slug);
  if (atPath == null) {
    throw new Error(`Real estate type not found: ${slug}`);
  }

  const { realType, params: pathParams } = atPath;
  const { query: rawParams } = queryString.parseUrl(webUrl, { arrayFormat: 'comma' });

  // Same precedence as on the German side: an explicit query parameter replaces what the path
  // implied, and the path in turn replaces the type's default.
  const fromPath = keepSupported(pathParams, realType, 'path filter');
  const fromQuery = keepSupported(translateAtQueryParams(rawParams), realType, 'query parameter');
  const searchParams = {
    ...defaultParamsFor(realType),
    ...fromPath,
    ...fromQuery,
  };

  // Except for a range, which the Austrian site may state half of in the path ("bis-1100-euro") and
  // the other half in the query (`primaryPriceFrom=500`). Replacing the whole parameter dropped the
  // path's bound; the query now wins per side, and a side it leaves open keeps the path's.
  for (const param of AT_RANGE_PARAMS) {
    if (fromPath[param] != null && fromQuery[param] != null) {
      searchParams[param] = mergeRange(fromPath[param], fromQuery[param]);
    }
  }

  return buildMobileSearchUrl(realType, { searchType: 'region', geocodes: toGeocode(area) }, searchParams);
}

/** The mobile API parameters written as a `min-max` range. */
const AT_RANGE_PARAMS = ['price', 'livingspace', 'numberofrooms'];

/**
 * Two `min-max` ranges side by side: each bound of `later` where it is set, `earlier`'s otherwise.
 *
 * @param {unknown} earlier
 * @param {unknown} later
 * @returns {unknown}
 */
function mergeRange(earlier, later) {
  if (typeof earlier !== 'string' || typeof later !== 'string') {
    return later ?? earlier;
  }
  const [earlierMin = '', earlierMax = ''] = earlier.split('-');
  const [laterMin = '', laterMax = ''] = later.split('-');
  return `${laterMin || earlierMin}-${laterMax || earlierMax}`;
}

/**
 * Rewrites a listing's web expose URL to its mobile API counterpart.
 *
 * Keyed on the German host for both national sites, and not by oversight: the mobile API answers
 * with the German index's numeric id for an Austrian listing too, and states the German expose page
 * as that listing's own share link. The Austrian site's `/expose/<24 hex>` ids are a different
 * identifier space that the mobile API does not know at all.
 *
 * @param {string|null|undefined} url A `https://www.immobilienscout24.de/expose/...` URL.
 * @returns {string|null} The mobile expose URL, or null when there was nothing to rewrite.
 */
export function convertImmoscoutListingToMobileListing(url) {
  if (nullOrEmpty(url)) {
    return null;
  }

  return url.replace(
    /^https:\/\/www\.immobilienscout24\.de\/expose\//,
    'https://api.mobile.immobilienscout24.de/expose/',
  );
}
