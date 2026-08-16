/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Translates an immowelt search URL into a request body for immowelt's search BFF.
 *
 * Immowelt's result page is a micro-frontend that renders nothing server side any more: it posts
 * the search to `/serp-bff/search` and then asks `/classifiedList/{ids}` for the cards. The URL
 * query string and the BFF's `criteria` object are two spellings of the same "search model", which
 * is why this translation is mostly a rename:
 *
 *   ?distributionTypes=Rent&estateTypes=Apartment&locations=AD08DE8634&priceMax=1200
 *   → {criteria: {distributionTypes: ['Rent'], estateTypes: ['Apartment'],
 *                 location: {placeIds: ['AD08DE8634']}, priceMax: 1200}}
 *
 * Only `locations` is genuinely reshaped - the BFF nests it under `location.placeIds`.
 *
 * Enum values are passed through untouched rather than checked against a local whitelist. The BFF
 * validates them itself and answers 400 with the offending path and the full list of accepted
 * values, which is both more accurate than a copy kept here and self-updating when immowelt adds a
 * type. A local whitelist would instead silently drop a value and quietly widen the user's search.
 *
 * @see lib/services/immowelt/immoweltBff.js for the transport that sends this.
 */

import logger from '../logger.js';

/** Base url of the search page these query strings come from. */
export const IMMOWELT_SEARCH_PATH = '/classified-search';

/** How many listings one search asks for. The BFF accepts far more than the web page's 30. */
export const DEFAULT_PAGE_SIZE = 100;

/** Sort order used when the url does not carry one. Matches `sortByDateParam`. */
export const DEFAULT_ORDER = 'DateDesc';

/**
 * Query parameters holding a comma separated list of enum values, copied to `criteria` as arrays
 * under the same name.
 */
const LIST_PARAMS = ['distributionTypes', 'estateTypes', 'estateSubTypes', 'projectTypes', 'featuresIncluded'];

/** Query parameters holding a single number, copied to `criteria` as numbers under the same name. */
const NUMBER_PARAMS = ['priceMin', 'priceMax', 'numberOfRoomsMin', 'numberOfRoomsMax', 'spaceMin', 'spaceMax'];

/**
 * Query parameters holding a single enum value. The url spells these in whatever case the UI
 * happened to produce, the BFF insists on PascalCase, so they go through {@link toPascalCase}.
 */
const ENUM_PARAMS = ['classifiedBusiness', 'priceType'];

/** Paging parameters - the only ones that do not belong in `criteria`. */
const PAGING_PARAMS = ['order', 'page'];

/**
 * Parameters that carry no search meaning: campaign tags, the serp's own view state and the
 * anchors it appends to card links. Present in nearly every url a user copies out of the browser,
 * and warning about them would train people to ignore the warning.
 */
const NOISE_PARAMS = new Set(['m', 'sr', 'cp', 'sp', 'serp_view', 'search', 'redirect', 'dispatchModal', 'ln']);

/**
 * Turn `WARM_RENT`, `warm_rent` or `warmRent` into `WarmRent`.
 *
 * @param {string} value raw query parameter value
 * @returns {string} the value in the PascalCase spelling the BFF's enums use
 */
function toPascalCase(value) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * @param {string} value comma separated list, possibly with blanks around the commas
 * @returns {string[]} the non-empty entries
 */
function toList(value) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Build the BFF request for one immowelt search url.
 *
 * @param {string} searchUrl the job's search url, after `queryStringMutator` has forced the sort order
 * @param {object} [options]
 * @param {number} [options.size] how many listings to ask for in one page
 * @returns {{criteria: object, paging: {page: number, size: number, order: string}}} the POST body for `/serp-bff/search`
 * @throws {Error} when the url carries no location the BFF could search in
 */
export function convertSearchUrlToRequest(searchUrl, { size = DEFAULT_PAGE_SIZE } = {}) {
  const params = new URL(searchUrl).searchParams;

  /** @type {Record<string, any>} */
  const criteria = {};

  for (const name of LIST_PARAMS) {
    const raw = params.get(name);
    if (raw == null) continue;
    const values = toList(raw);
    if (values.length > 0) criteria[name] = values;
  }

  for (const name of NUMBER_PARAMS) {
    const raw = params.get(name);
    if (raw == null || raw.trim() === '') continue;
    const value = Number(raw);
    // A typo in a price would otherwise reach the BFF as NaN, which serialises to null and is
    // silently treated as "no limit" - the user would get listings way outside their budget.
    if (!Number.isFinite(value)) {
      logger.warn(`Ignoring immowelt search parameter '${name}': '${raw}' is not a number.`);
      continue;
    }
    criteria[name] = value;
  }

  for (const name of ENUM_PARAMS) {
    const raw = params.get(name);
    if (raw == null || raw.trim() === '') continue;
    criteria[name] = toPascalCase(raw.trim());
  }

  const placeIds = toList(params.get('locations') ?? '');
  if (placeIds.length === 0) {
    throw new Error(
      `Immowelt search url carries no 'locations' parameter, so there is nothing to search in: ${searchUrl}`,
    );
  }
  criteria.location = { placeIds };

  const page = Number(params.get('page') ?? 1);
  const paging = {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    size,
    order: params.get('order') || DEFAULT_ORDER,
  };

  warnAboutUnhandledParams(params, searchUrl);

  return { criteria, paging };
}

/**
 * Log every query parameter this translator does not understand.
 *
 * An unknown parameter is always a narrowing filter the user set in immowelt's UI (a radius, a
 * drawn polygon, a construction year). Dropping it silently would hand the user a search wider
 * than the one they pasted, and they would only notice by the notifications they get for flats
 * they excluded on purpose.
 *
 * @param {URLSearchParams} params the url's query parameters
 * @param {string} searchUrl the url, for the log line
 * @returns {void}
 */
function warnAboutUnhandledParams(params, searchUrl) {
  const handled = new Set([...LIST_PARAMS, ...NUMBER_PARAMS, ...ENUM_PARAMS, ...PAGING_PARAMS, 'locations']);

  const unhandled = [...new Set(params.keys())].filter(
    (name) => !handled.has(name) && !NOISE_PARAMS.has(name) && !name.startsWith('utm_'),
  );

  if (unhandled.length > 0) {
    logger.warn(
      `Immowelt search url uses filter(s) Fredy cannot translate yet: ${unhandled.join(', ')}. ` +
        `Those are ignored, so the search runs wider than the one in your browser. Url: ${searchUrl}`,
    );
  }
}
