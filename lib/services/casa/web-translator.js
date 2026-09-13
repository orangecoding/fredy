/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Reads a search url copied out of casa.it into the search its api answers.
 *
 * The portal writes a search in two shapes and both are read here. A search over a town
 * ("/affitto/residenziale/roma/") says everything in its path; a search drawn on the map
 * ("/srp/map/?geopolygon=...") says everything in its query string.
 *
 * What the two have in common is the answer's shape: a `where` saying which ground to search, and
 * `filters` saying what to look for on it.
 *
 * See `reverse-engineered-casa.md`.
 */

import { readFilters, WHERE_HINT_PARAM } from './search-filters.js';
import { resolvePlace } from './geography.js';
import logger from '../logger.js';

/** The path a search drawn on the map is written at. */
const MAP_SEARCH_PATH = '/srp/map/';

/** The first segment of a search written as a path, and what it means to the api. */
const CONTRACTS = { vendita: 'vendita', affitto: 'affitto' };

/**
 * The second segment, which the website calls a category and the api takes as a group of property
 * kinds. Only the residential one is carried over: it is the group every other entry would have to
 * be confirmed against, and this api answers a group it does not know with the residential one
 * rather than with an error, so an unconfirmed guess is indistinguishable from the truth.
 */
const CATEGORIES = { residenziale: 'case' };

/** The shape of the hkey the url's `q` carries, the place a map search was drawn within. */
const HKEY_SHAPE = /^[0-9a-f]{8}$/;

/**
 * @typedef {Object} CasaSearch
 * @property {any[]} where The ground to search.
 * @property {Record<string, any>} filters What to look for on it.
 * @property {Record<string, any>} modifiers How the api should shape the answer around them.
 */

/**
 * The ground a drawn search covers.
 *
 * The shape on the map is, for the api, only ever a `where` entry. The site's own request for a
 * drawn search does not carry the shape at all - it names the place the drawing sits in and lets
 * the map pin-filter client-side - but the api does answer a drawn polygon, and a polygon is what
 * was asked for, so the shape is kept where one was drawn and only a url without one falls back to
 * the place.
 *
 * @param {Record<string, string>} area The url's area parameters, decoded.
 * @returns {any[]|null}
 */
function drawnArea(area) {
  if (area.geopolygon != null) {
    const ring = JSON.parse(area.geopolygon)?.polygon;
    if (!Array.isArray(ring) || ring.length < 3) return null;
    // The url writes a point as [lat, lon] and the api reads it as [lon, lat]. Sent in the url's
    // own order the api answers nothing at all, which reads as a search with no results.
    return [{ geo: { polygon: ring.map(([lat, lon]) => [lon, lat]) } }];
  }

  if (area.geocircle != null) {
    const circle = JSON.parse(area.geocircle);
    // The url wraps the circle in a list: {"circle":[{"distance":...,"center":[lat,lon]}]}.
    const shape = Array.isArray(circle?.circle) ? circle.circle[0] : circle;
    const centre = shape?.center ?? shape?.centre;
    const distance = shape?.distance ?? shape?.radius;
    if (!Array.isArray(centre) || distance == null) return null;
    // The centre of a circle, confusingly, is [lat, lon] - the order the url already carries.
    return [{ geo: { center: centre, distance: Number(distance) } }];
  }

  if (area.geobounds != null) {
    const corners = JSON.parse(area.geobounds)?.bbox;
    if (
      !Array.isArray(corners) ||
      corners.length !== 2 ||
      !corners.every((corner) => Array.isArray(corner) && corner.length === 2)
    ) {
      return null;
    }
    // The url names two corners of a rectangle as [lat, lon]. The api has no box of its own - the
    // shapes it answers are the polygon and the circle - so the box is sent as the rectangle it is.
    const [[lat1, lon1], [lat2, lon2]] = corners;
    const ring = [
      [lon1, lat1],
      [lon2, lat1],
      [lon2, lat2],
      [lon1, lat2],
      [lon1, lat1],
    ];
    return [{ geo: { polygon: ring } }];
  }

  return null;
}

/**
 * The place a drawn search sits in, named by the url's `q` the way the site's own request names it.
 *
 * @param {string|undefined} q The url's `q` value.
 * @returns {any[]|null} a where naming that hkey, or null when there is no usable one
 */
function hintedArea(q) {
  return typeof q === 'string' && HKEY_SHAPE.test(q) ? [{ hkey: q }] : null;
}

/**
 * @param {string} webUrl
 * @returns {URL|null} A supported Casa.it URL, or null for an invalid URL or another host.
 */
export function parseCasaUrl(webUrl) {
  try {
    const parsed = new URL(webUrl);
    return ['http:', 'https:'].includes(parsed.protocol) && ['casa.it', 'www.casa.it'].includes(parsed.hostname)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} webUrl A url copied out of casa.it.
 * @returns {Promise<CasaSearch|null>} null when the url names a search the api cannot be asked for
 */
export async function translateSearchUrl(webUrl) {
  const parsed = parseCasaUrl(webUrl);
  if (parsed == null) return null;

  const read = readFilters(parsed.search);
  if (read == null) {
    logger.debug(`Casa.it: ${webUrl} carries a filter with no counterpart; reading the website.`);
    return null;
  }
  const { filters, area, modifiers } = read;

  if (parsed.pathname === MAP_SEARCH_PATH) {
    // A drawn shape wins over the place it sits in: it is what was asked for, and the api answers
    // it. Without one the url still names a place, and the place is what the site's own request
    // searches - the shape on the map is the map's business, the list is the area's.
    const where = drawnArea(area) ?? hintedArea(area[WHERE_HINT_PARAM]);
    if (where == null) return null;
    return { where, filters, modifiers };
  }

  const segments = parsed.pathname.split('/').filter((segment) => segment !== '');
  if (segments.length < 3) return null;

  const contract = CONTRACTS[segments[0]];
  const group = CATEGORIES[segments[1]];
  if (contract == null || group == null) return null;

  const place = await resolvePlace(segments[segments.length - 1]);
  if (place == null) {
    logger.debug(`Casa.it: no place is called "${segments[segments.length - 1]}".`);
    return null;
  }

  return {
    where: [{ hkey: place.hkey, level: place.level }],
    // What the url says wins over what its path implied, the way the website reads its own url.
    filters: { 'transaction.type': contract, property_type_group: group, ...filters },
    modifiers,
  };
}
