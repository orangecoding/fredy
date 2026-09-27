/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Translates a leboncoin search url into the body of its `finder/search` endpoint.
 *
 * leboncoin's search page is a Next.js application that builds a search object from the url and
 * posts it to `https://api.leboncoin.fr/finder/search`. The url and the body are two spellings of
 * that search object, and the rules between them are the site's own, read out of its bundles
 * (`URL_NAME_TO_FILTER`, `getSearchLocationsUrlParam`, `IGNORE_SEARCH_PARAMS_LIST`):
 *
 *   /recherche?category=10&locations=Paris_75011&real_estate_type=2&price=min-1500&furnished=1
 *   → {filters: {category: {id: '10'},
 *                location: {locations: [{locationType: 'city', city: 'Paris', zipcode: '75011'}]},
 *                enums: {ad_type: ['offer'], real_estate_type: ['2'], furnished: ['1']},
 *                ranges: {price: {max: 1500}}}}
 *
 * A handful of parameters have a place of their own in the body (the category, the keywords, the
 * places, the sort order). Every other parameter is a filter, and its value says which kind: a
 * range is written `min-max` with either end open (`price=min-1500`, `square=20-max`), and anything
 * else is a comma separated list of enum values. The site's own formatter writes them exactly that
 * way, which is why this translator needs no table of filter names - a filter leboncoin adds
 * tomorrow is translated the same way the ones it has today are.
 *
 * Measured against the endpoint in September 2026: a city with and without a postcode, a
 * department, a region, a radius around a point and the price and area ranges all answer with the
 * adverts the website shows for the same url.
 */

import { isCampaignParam } from '../../utils/campaignParams.js';

/** The site every search url and every advert link is on. */
export const LEBONCOIN_ORIGIN = 'https://www.leboncoin.fr';

/** How many adverts one request asks for: the site's own page size. */
export const ADS_PER_PAGE = 35;

/**
 * Category channels the site uses in its `/c/<channel>` browse pages, for the property categories.
 * A browse page carries its category in the path rather than in `category=`.
 */
const CATEGORY_CHANNELS = {
  immobilier: '8',
  ventes_immobilieres: '9',
  locations: '10',
  colocations: '11',
  bureaux_commerces: '13',
};

/**
 * Parameters the site itself drops before it searches (`IGNORE_SEARCH_PARAMS_LIST`), plus the
 * paging: the saved-search markers, the ad server's debugging switches and the spellings of a place
 * the site no longer reads. None of them narrows the search, so none of them is worth stopping a job
 * over. Campaign tags are the same kind of noise and are told apart by {@link isCampaignParam}.
 */
const IGNORED_PARAMS = new Set([
  'from',
  'pi',
  'kst',
  'sa',
  'saved_id_edit',
  'saved_id_view',
  'quick_form',
  'ref_id',
  'shippable_auto',
  'location',
  'region',
  'regions',
  'region_near',
  'department',
  'departments',
  'department_near',
  'cities',
  'amzn_debug_mode',
  'google_preview',
  'gdfp_req',
  'lineItemId',
  'creativeId',
  'iu',
  'redirect_hash',
  'triplelifttest',
  'tl_bid_tactic_id',
  'kp',
  'ka',
  // The label the site shows for an "around a point" search ("Rue de Rivoli, Paris"). The site
  // reads it as part of the place, not as a filter; the point itself is lat/lng/radius.
  'around',
  // Fredy always reads the first page of the newest adverts.
  'page',
]);

/** Parameters that land in `filters.location.area` rather than being filters of their own. */
const AREA_PARAMS = ['lat', 'lng', 'radius', 'default_radius'];

/**
 * A range as the site writes it: either bound open, and a suffix saying whether the site may widen
 * it - `-lax` where it may, `-strict` where the user turned that off.
 */
const RANGE = /^(min|\d+(?:\.\d+)?)-(max|\d+(?:\.\d+)?)(?:-(lax|strict))?$/;

/** A postcode, as opposed to the department number the site writes when a town has no postcode. */
const POSTCODE = /^\d{5}$/;

/**
 * @typedef {Object} LeboncoinArea
 * @property {number} lat
 * @property {number} lng
 * @property {number} default_radius the radius the place covers on its own, in metres
 * @property {number} [radius] the radius the user widened it to, in metres
 */

/**
 * @typedef {Object} LeboncoinSearchBody
 * @property {number} limit
 * @property {number} limit_alu the "à la une" promoted adverts, which are not asked for
 * @property {number} offset
 * @property {string} sort_by
 * @property {string} sort_order
 * @property {string} [owner_type]
 * @property {Record<string, any>} filters
 */

/**
 * Read the area suffix of a place: `lat_lng_defaultRadius[_radius]`.
 *
 * @param {string|undefined} raw the part after `__`
 * @param {string} searchUrl the url, for the error message
 * @returns {LeboncoinArea|undefined}
 * @throws {Error} when it is there and not four numbers - a radius read wrong is a different search
 */
function parseArea(raw, searchUrl) {
  if (raw == null || raw === '') return undefined;
  const [lat, lng, defaultRadius, radius] = raw.split('_').map(Number);
  if (![lat, lng, defaultRadius].every(Number.isFinite) || (radius != null && !Number.isFinite(radius))) {
    throw new Error(`leboncoin search url describes an area Fredy cannot read ('${raw}'). Url: ${searchUrl}`);
  }
  return { lat, lng, default_radius: defaultRadius, ...(radius != null ? { radius } : {}) };
}

/**
 * Read `<name>[_<code>][__<area>]`, the shape a town, a district and a place share.
 *
 * @param {string} raw
 * @param {string} searchUrl
 * @returns {{name: string, code?: string, area?: LeboncoinArea}}
 */
function parseNamedPlace(raw, searchUrl) {
  const [namePart, areaPart] = raw.split('__');
  const separator = namePart.lastIndexOf('_');
  const name = separator < 0 ? namePart : namePart.slice(0, separator);
  const code = separator < 0 ? undefined : namePart.slice(separator + 1);
  const area = parseArea(areaPart, searchUrl);
  return { name, ...(code ? { code } : {}), ...(area ? { area } : {}) };
}

/**
 * Read one entry of the `locations` parameter, the inverse of the site's
 * `getSearchLocationsUrlParam`.
 *
 * @param {string} entry e.g. `Paris_75011`, `Paris__48.85717_2.3414_9256`, `d_69`, `r_12`
 * @param {string} searchUrl the url, for the error messages
 * @returns {Record<string, any>} one location of `filters.location.locations`
 */
export function parseLocation(entry, searchUrl) {
  const prefixed = /^(r|rn|d|dn|p|bbox|polygon|district)_(.*)$/.exec(entry);
  const [kind, rest] = prefixed == null ? ['city', entry] : [prefixed[1], prefixed[2]];

  switch (kind) {
    case 'r':
      return { locationType: 'region', region_id: rest };
    case 'rn':
      return { locationType: 'region_near', region_id: rest };
    case 'd':
      return { locationType: 'department', department_id: rest };
    case 'dn':
      return { locationType: 'department_near', department_id: rest };
    case 'bbox': {
      const bbox = rest.split('|').map(Number);
      if (bbox.length !== 4 || !bbox.every(Number.isFinite)) {
        throw new Error(`leboncoin search url carries a map section Fredy cannot read ('${entry}'). Url: ${searchUrl}`);
      }
      return { locationType: 'bbox', area: { bbox } };
    }
    case 'polygon': {
      const polygon = rest.split(';').map((point) => point.split('|').map(Number));
      if (polygon.length < 3 || !polygon.every((point) => point.length === 2 && point.every(Number.isFinite))) {
        throw new Error(`leboncoin search url carries a drawn area Fredy cannot read ('${entry}'). Url: ${searchUrl}`);
      }
      return { locationType: 'polygon', area: { polygon } };
    }
    case 'p': {
      const { name, code, area } = parseNamedPlace(rest, searchUrl);
      return { locationType: 'place', place: name, ...(code ? { zipcode: code } : {}), ...(area ? { area } : {}) };
    }
    case 'district': {
      const { name, code, area } = parseNamedPlace(rest, searchUrl);
      return {
        locationType: 'district',
        district: name,
        ...(code ? { zipcode: code } : {}),
        ...(area ? { area } : {}),
      };
    }
    default: {
      const { name, code, area } = parseNamedPlace(rest, searchUrl);
      // A town the site knows by postcode carries it; one it does not (a whole commune spread over
      // several) carries its department instead. The two are told apart by their length.
      const where = code == null ? {} : POSTCODE.test(code) ? { zipcode: code } : { department_id: code };
      // A bare postcode is written without a town: `75011` and nothing else.
      if (POSTCODE.test(name) && code == null)
        return { locationType: 'city', zipcode: name, ...(area ? { area } : {}) };
      return { locationType: 'city', city: name, ...where, ...(area ? { area } : {}) };
    }
  }
}

/**
 * Read one range the way the site's own url parser does.
 *
 * Exported for the provider's price band, which has to describe exactly the range this sends: a
 * value this does not read as a range goes out as an enum and narrows nothing by price.
 *
 * @param {string} value `min-1500`, `20-max`, `2-3`, `2-3-lax`, `min-1500-strict`
 * @returns {{min?: number, max?: number, lax?: boolean}|null} null when the value is not a range
 */
export function parseRange(value) {
  const match = RANGE.exec(value);
  if (match == null) return null;
  const [, min, max, widening] = match;
  return {
    ...(min !== 'min' ? { min: Number(min) } : {}),
    ...(max !== 'max' ? { max: Number(max) } : {}),
    ...(widening != null ? { lax: widening === 'lax' } : {}),
  };
}

/**
 * Read the category a url searches: `category=` on a search, the path on a browse page.
 *
 * @param {URL} url
 * @param {string} searchUrl
 * @returns {string|null}
 * @throws {Error} when the url is neither
 */
function readCategory(url, searchUrl) {
  if (/^\/recherche\/?$/.test(url.pathname)) return url.searchParams.get('category');

  const channel = /^\/c\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  if (channel != null && CATEGORY_CHANNELS[channel] != null) return CATEGORY_CHANNELS[channel];

  throw new Error(
    `'${searchUrl}' is not a leboncoin search Fredy can read. Run the search on leboncoin.fr and copy the address ` +
      `of the result page, which reads ${LEBONCOIN_ORIGIN}/recherche?...`,
  );
}

/**
 * Build the `finder/search` body for a search url.
 *
 * @param {string} searchUrl the job's search url, after `queryStringMutator` has set the sort order
 * @param {{limit?: number}} [options]
 * @returns {LeboncoinSearchBody}
 * @throws {Error} when the url is not a leboncoin search, or names a place this cannot read
 */
export function convertSearchUrlToBody(searchUrl, { limit = ADS_PER_PAGE } = {}) {
  let url;
  try {
    url = new URL(searchUrl);
  } catch {
    throw new Error(`'${searchUrl}' is not a url Fredy can read.`);
  }

  const category = readCategory(url, searchUrl);
  /** @type {Record<string, any>} */
  const filters = { ...(category ? { category: { id: category } } : {}), enums: {}, ranges: {} };
  /** @type {Record<string, any>} */
  const location = {};
  /** @type {Record<string, number>} */
  const area = {};
  const body = { limit, limit_alu: 0, offset: 0, sort_by: 'time', sort_order: 'desc' };

  for (const [name, rawValue] of url.searchParams) {
    const value = rawValue.trim();
    if (value === '' || name === 'category' || IGNORED_PARAMS.has(name) || isCampaignParam(name)) continue;

    if (name === 'locations') {
      location.locations = value
        .split(',')
        .filter(Boolean)
        .map((entry) => parseLocation(entry, searchUrl));
    } else if (AREA_PARAMS.includes(name)) {
      const figure = Number(value);
      if (!Number.isFinite(figure)) {
        throw new Error(
          `leboncoin search parameter '${name}' is '${rawValue}', which is not a number. Url: ${searchUrl}`,
        );
      }
      area[name] = figure;
    } else if (name === 'shippable') {
      location.shippable = value === 'true' || value === '1';
    } else if (name === 'text') {
      filters.keywords = { ...filters.keywords, text: value };
    } else if (name === 'search_in') {
      filters.keywords = { ...filters.keywords, type: value };
    } else if (name === 'owner_type') {
      body.owner_type = value;
    } else if (name === 'sort') {
      body.sort_by = value;
    } else if (name === 'order') {
      body.sort_order = value;
    } else {
      const range = parseRange(value);
      if (range != null) filters.ranges[name] = range;
      else filters.enums[name] = value.split(',').filter(Boolean);
    }
  }

  if (Object.keys(area).length > 0) location.area = area;
  if (Object.keys(location).length > 0) filters.location = location;
  // The site searches offers unless the url asks for the wanted ads, and so does this.
  filters.enums.ad_type ??= ['offer'];
  if (Object.keys(filters.ranges).length === 0) delete filters.ranges;

  return { ...body, filters };
}
