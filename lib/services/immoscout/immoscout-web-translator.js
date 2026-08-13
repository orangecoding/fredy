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
 * ```
 *
 * The knowledge the translation needs sits in three modules next to this one, each with its own
 * tests, so that extending it means touching one table:
 *
 * - `./web-paths.js` - what a path segment means, since the web UI hides single filters in the path
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
import { keepSupported } from './param-support.js';
import { toPolyline } from './shape.js';
import { DEFAULT_PARAMS_BY_TYPE, resolveWebPath } from './web-paths.js';

export { listKnownWebPaths } from './web-paths.js';

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
 * Converts an ImmoScout web search URL into the mobile API search URL for the same search.
 *
 * @param {string} webUrl A URL copied out of the ImmoScout website.
 * @returns {string} The mobile API `search/list` URL.
 * @throws {Error} If the URL is malformed, is not a search URL, or names a search we cannot map.
 */
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
    ...(defaults ?? DEFAULT_PARAMS_BY_TYPE[realType] ?? {}),
    ...keepSupported(pathParams, realType, 'path filter'),
    ...keepSupported(queryParams, realType, 'query parameter'),
  };

  const mobileQuery = queryString.stringify(
    { realestatetype: realType, ...toLocation(segments, rawParams), ...searchParams },
    { arrayFormat: 'comma', encode: true, skipEmptyString: true },
  );

  return `https://api.mobile.immobilienscout24.de/search/list?${mobileQuery}`;
}

/**
 * Rewrites a listing's web expose URL to its mobile API counterpart.
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
