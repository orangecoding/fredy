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
 * Only the search area is genuinely reshaped - see {@link parseLocations} for the three spellings
 * immowelt uses for it.
 *
 * Enum values are passed through untouched rather than checked against a local whitelist. The BFF
 * validates them itself and answers 400 with the offending path and the full list of accepted
 * values, which is both more accurate than a copy kept here and self-updating when immowelt adds a
 * type. A local whitelist would instead silently drop a value and quietly widen the user's search.
 *
 * A parameter this translator does not know is a hard error rather than a warning. Every unknown
 * parameter is a narrowing filter - a construction year, a drawn area, the map's viewport - so
 * dropping it hands back a search wider than the saved one, and the user only finds out through
 * notifications for the flats they excluded on purpose.
 *
 * @see lib/services/immowelt/immoweltBff.js for the transport that sends this.
 */

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
const LIST_PARAMS = [
  'distributionTypes',
  'estateTypes',
  'estateSubTypes',
  'projectTypes',
  'featuresIncluded',
  'furnished',
  'useFor',
  'buildState',
  'energyTypes',
  'energyCertificateClass',
  'locationsInBuildingIncluded',
  'locationsInBuildingExcluded',
];

/** Query parameters holding a single number, copied to `criteria` as numbers under the same name. */
const NUMBER_PARAMS = [
  'priceMin',
  'priceMax',
  'numberOfRoomsMin',
  'numberOfRoomsMax',
  'spaceMin',
  'spaceMax',
  'yearOfConstructionMin',
  'yearOfConstructionMax',
  'plotSpaceMin',
  'plotSpaceMax',
  'numberOfBedroomsMin',
  'numberOfBedroomsMax',
];

/**
 * Query parameters holding a single enum value. The url spells these in whatever case the UI
 * happened to produce, the BFF insists on PascalCase, so they go through {@link toPascalCase}.
 */
const ENUM_PARAMS = ['classifiedBusiness', 'priceType'];

/**
 * Query parameters holding a single enum value that must reach the BFF exactly as written.
 *
 * The BFF is not consistent about its spellings: `priceType` wants `WarmRent`, while the WBS filter
 * accepts `No`, `Yes` and `Not_Applicable` - and running that last one through
 * {@link toPascalCase} would turn it into a value the BFF rejects.
 */
const VERBATIM_ENUM_PARAMS = ['certificateOfEligibilityNeeded'];

/** Query parameters holding `true` or `false`, copied to `criteria` as booleans. */
const BOOLEAN_PARAMS = ['isSaleGoodwill', 'availableFromIsLooseMode'];

/** Query parameters holding a date the BFF wants as `YYYY-MM-DD` or a full ISO timestamp. */
const DATE_PARAMS = ['availableFromMax'];

/**
 * Filters immowelt's own url carries that its search BFF has no field for.
 *
 * Unknown keys in `criteria` are dropped by the BFF without a word - a made-up one answers with the
 * unfiltered result set - so mapping these would be the silent widening this translator exists to
 * prevent. They stay unhandled, which stops the job and names them.
 */
const UNTRANSLATABLE_PARAMS = ['keywords', 'listingsDisplay', 'deliveryTimeline'];

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
 * Decode one base64url encoded `locations` entry.
 *
 * Immowelt's map search packs the drawn areas into the same query parameter the list search uses
 * for place ids, base64url encoded and without padding. A plain place id (`AD08DE9991`,
 * `POCODE741`) is not valid base64 of a JSON object, so it simply fails this and is treated as the
 * id it is - which is why the caller can tell the two apart without a heuristic on the id format.
 *
 * @param {string} value one entry of the `locations` parameter
 * @returns {Record<string, any>|null} the decoded object, or null when the entry is a plain id
 */
function decodeLocationEntry(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(base64 + '='.repeat((4 - (base64.length % 4)) % 4), 'base64').toString('utf8');
  if (!json.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(json);
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Keys a decoded `locations` object may carry.
 *
 * Immowelt writes the same thing two ways. A search area drawn on the map arrives as
 * `{drawings: ['<encoded polyline>']}`, a radius saved around a place as
 * `{placeId, radius, polyline, coordinates}`. Both name the boundary as an encoded polyline, which
 * the BFF takes as `location.polylines` unchanged.
 */
const ENCODED_LOCATION_KEYS = new Set(['drawings', 'polylines', 'polyline', 'placeIds', 'placeId']);

/**
 * Keys that describe the boundary a second time, in a form the BFF has no field for.
 *
 * `radius` and `coordinates` are the centre and reach of the circle the accompanying `polyline`
 * already spells out exactly, so they are redundant next to it - and, without it, the one thing
 * that would have narrowed the search. They are accepted alongside a boundary and refused without
 * one.
 */
const ENCODED_BOUNDARY_COMPANIONS = new Set(['radius', 'coordinates']);

/**
 * @param {any} value
 * @returns {string[]} the value as a list of non-empty strings
 */
function toStringList(value) {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).map((entry) => String(entry).trim()).filter(Boolean);
}

/**
 * Turn the `locations` parameter into the BFF's `criteria.location`.
 *
 * Three spellings reach this, and immowelt mixes them freely in one url:
 *
 *   locations=AD08DE9991,POCODE741        → {placeIds: ['AD08DE9991', 'POCODE741']}
 *   locations=eyJkcmF3aW5ncyI6WyJhaHt2...  → {polylines: ['ah{vHm`xrA?ivIj`C??hvIk`C?']}
 *                                            (base64url of {"drawings":["ah{vHm`xrA?..."]})
 *
 * An id that reaches the BFF in the encoded form is answered with `PlaceIds must contain only
 * alphanumeric valid location type`, which is the 400 every map-drawn job used to die on.
 *
 * A boundary replaces the places rather than joining them. The BFF intersects `placeIds` with
 * `polylines` - Dresden plus a rectangle over one district answers with the 34 listings of the
 * rectangle, not the city's 1411 - so keeping both would cut away exactly the surroundings a radius
 * was saved for. Immowelt's own map drops the ids from its request the moment a drawing exists.
 *
 * @param {string|null} raw the raw `locations` parameter
 * @param {string} searchUrl the url, for the error messages
 * @returns {{placeIds?: string[], polylines?: string[]}} the BFF's `criteria.location`
 * @throws {Error} when the url carries no usable area, or one this translator would have to drop
 */
function parseLocations(raw, searchUrl) {
  const entries = toList(raw ?? '');
  if (entries.length === 0) {
    throw new Error(
      `Immowelt search url carries no 'locations' parameter, so there is nothing to search in: ${searchUrl}`,
    );
  }

  /** @type {string[]} */
  const placeIds = [];
  /** @type {string[]} */
  const polylines = [];

  for (const entry of entries) {
    const decoded = decodeLocationEntry(entry);
    if (decoded == null) {
      placeIds.push(entry);
      continue;
    }

    const unsupported = Object.keys(decoded).filter(
      (key) => !ENCODED_LOCATION_KEYS.has(key) && !ENCODED_BOUNDARY_COMPANIONS.has(key),
    );
    if (unsupported.length > 0) {
      throw new Error(
        `Immowelt search url describes its search area with ${unsupported.join(', ')}, which Fredy cannot ` +
          `translate yet. Searching without it would cover a different area than the one you saved, so the job ` +
          `stops instead. Please open an issue with this url so it can be added: ${searchUrl}`,
      );
    }

    const boundary = [
      ...toStringList(decoded.drawings),
      ...toStringList(decoded.polylines),
      ...toStringList(decoded.polyline),
    ];
    if (boundary.length > 0) {
      polylines.push(...boundary);
      continue;
    }

    // A radius that lost its polyline leaves nothing to search by but the place it was drawn
    // around, which is the whole city instead of the few streets the user saved.
    const companions = Object.keys(decoded).filter((key) => ENCODED_BOUNDARY_COMPANIONS.has(key));
    if (companions.length > 0) {
      throw new Error(
        `Immowelt search url saves its search area as ${companions.join(', ')} without the boundary Fredy needs ` +
          `to reproduce it. Searching the whole place instead would cover a wider area than the one you saved, so ` +
          `the job stops instead. Url: ${searchUrl}`,
      );
    }

    placeIds.push(...toStringList(decoded.placeIds), ...toStringList(decoded.placeId));
  }

  if (polylines.length > 0) return { polylines };

  if (placeIds.length === 0) {
    throw new Error(
      `Immowelt search url carries an empty 'locations' parameter, so there is nothing to search in: ${searchUrl}`,
    );
  }

  return { placeIds };
}

/**
 * Turn the map view's `bbox` parameter into the polygon the BFF calls `location.geometry`.
 *
 * `bbox` is base64 of `minLon,minLat,maxLon,maxLat` and immowelt's own map sends exactly that
 * rectangle as a closed ring alongside the drawn areas. It narrows the result set, so a url that
 * carries one and is searched without it reports listings the user could not see on their map.
 *
 * @param {string} raw the raw `bbox` parameter
 * @param {string} searchUrl the url, for the error message
 * @returns {{type: string, coordinates: number[][][]}} the BFF's `criteria.location.geometry`
 * @throws {Error} when the parameter is not the four numbers a bounding box consists of
 */
function parseBoundingBox(raw, searchUrl) {
  const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const corners = decoded.split(',').map(Number);

  if (corners.length !== 4 || corners.some((value) => !Number.isFinite(value))) {
    throw new Error(
      `Immowelt search url carries a map section ('bbox') Fredy cannot read: '${decoded}'. Searching without it ` +
        `would cover a wider area than the map you saved, so the job stops instead. Url: ${searchUrl}`,
    );
  }

  const [minLon, minLat, maxLon, maxLat] = corners;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ],
    ],
  };
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
    // NaN serialises to null, which the BFF reads as "no limit". Dropping the parameter is the
    // same silent widening as ignoring an unknown one: the user would be notified about listings
    // way outside the budget they typed, so this stops too.
    if (!Number.isFinite(value)) {
      throw new Error(
        `Immowelt search parameter '${name}' is '${raw}', which is not a number. Searching without it would ` +
          `ignore a limit you set, so the job stops instead. Url: ${searchUrl}`,
      );
    }
    criteria[name] = value;
  }

  for (const name of ENUM_PARAMS) {
    const raw = params.get(name);
    if (raw == null || raw.trim() === '') continue;
    criteria[name] = toPascalCase(raw.trim());
  }

  for (const name of VERBATIM_ENUM_PARAMS) {
    const raw = params.get(name);
    if (raw == null || raw.trim() === '') continue;
    criteria[name] = raw.trim();
  }

  for (const name of BOOLEAN_PARAMS) {
    const raw = params.get(name);
    if (raw == null || raw.trim() === '') continue;
    const value = raw.trim().toLowerCase();
    // Anything else would reach the BFF as a string where it validates a boolean, which is a 400
    // for the whole search rather than one dropped filter - and guessing what the user meant is
    // how a filter silently turns into its opposite.
    if (value !== 'true' && value !== 'false') {
      throw new Error(
        `Immowelt search parameter '${name}' is '${raw}', which is neither true nor false. Url: ${searchUrl}`,
      );
    }
    criteria[name] = value === 'true';
  }

  for (const name of DATE_PARAMS) {
    const raw = params.get(name);
    if (raw == null || raw.trim() === '') continue;
    const value = raw.trim();
    if (!/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(value)) {
      throw new Error(
        `Immowelt search parameter '${name}' is '${raw}', which is not a date the BFF accepts ` +
          `(YYYY-MM-DD). Url: ${searchUrl}`,
      );
    }
    criteria[name] = value;
  }

  criteria.location = parseLocations(params.get('locations'), searchUrl);

  const bbox = params.get('bbox');
  if (bbox != null && bbox.trim() !== '') {
    criteria.location.geometry = parseBoundingBox(bbox.trim(), searchUrl);
  }

  const page = Number(params.get('page') ?? 1);
  const paging = {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    size,
    order: params.get('order') || DEFAULT_ORDER,
  };

  rejectUnhandledParams(params, searchUrl);

  return { criteria, paging };
}

/**
 * Refuse a url that carries a query parameter this translator does not understand.
 *
 * An unknown parameter is always a narrowing filter the user set in immowelt's UI (a construction
 * year, a drawn area, an energy class). Dropping it hands the user a search wider than the one
 * they pasted, and they only notice through notifications for the flats they excluded on purpose -
 * a job that stops with a named parameter is the lesser evil, and the only outcome that keeps a
 * saved search meaning what it says.
 *
 * @param {URLSearchParams} params the url's query parameters
 * @param {string} searchUrl the url, for the error message
 * @returns {void}
 * @throws {Error} when the url carries a parameter that is neither translated nor known noise
 */
function rejectUnhandledParams(params, searchUrl) {
  const handled = new Set([
    ...LIST_PARAMS,
    ...NUMBER_PARAMS,
    ...ENUM_PARAMS,
    ...VERBATIM_ENUM_PARAMS,
    ...BOOLEAN_PARAMS,
    ...DATE_PARAMS,
    ...PAGING_PARAMS,
    'locations',
    'bbox',
  ]);

  const unhandled = [...new Set(params.keys())].filter(
    (name) => !handled.has(name) && !NOISE_PARAMS.has(name) && !name.startsWith('utm_'),
  );

  if (unhandled.length > 0) {
    const ignoredByTheBff = unhandled.filter((name) => UNTRANSLATABLE_PARAMS.includes(name));
    const hint =
      ignoredByTheBff.length > 0
        ? ` The search BFF has no field for ${ignoredByTheBff.join(', ')} at all, so this url cannot be searched ` +
          `through the api - rebuild it in immowelt's filter panel without them.`
        : '';

    throw new Error(
      `Immowelt search url uses filter(s) Fredy cannot translate yet: ${unhandled.join(', ')}.${hint} Ignoring them would ` +
        `run a wider search than the one in your browser and notify you about listings you filtered out, so the job ` +
        `stops instead. Remove those filters from the url, or open an issue so they get translated. Url: ${searchUrl}`,
    );
  }
}
