/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import https from 'https';
import fetch from 'node-fetch';
import pThrottle from 'p-throttle';
import logger from '../../logger.js';
import { selfHostedUserAgent } from '../../userAgent.js';
import { normalizeSpanish } from '../normalize.js';

/**
 * Client for the Spanish broadband and mobile coverage maps published by the Secretaría de Estado
 * de Telecomunicaciones e Infraestructuras Digitales.
 *
 * Spain is the finest-grained of the four sources: the fixed-line maps are drawn per cadastral
 * parcel rather than per cell, and each parcel lists the operators serving it, the technology and
 * the speed - including whether an operator owns the line or resells somebody else's. Mobile is a
 * 50m grid per technology. The ministry publishes the lot as an ordinary ArcGIS feature service
 * with querying enabled, which makes this the only one of the four with a documented interface and
 * no reverse engineering behind it.
 *
 * The maps exist because Article 22 of the European Electronic Communications Code obliges the
 * member state to publish them, which is also why they can be expected to stay.
 */

/** The organisation the ministry publishes its services under. */
const HOST = 'https://services-eu1.arcgis.com/3LqdsBPalJaUFvo1/arcgis/rest/services';

/**
 * The four maps, and how to find the current edition of each.
 *
 * Every one of them carries its vintage in its own name (`CobBAFija_2024_vista`), and the four do
 * not move in step - the 5G map was already on 2025 while the rest were still on 2024. A
 * hard-coded name would therefore break one map at a time, silently, on a date nobody is watching
 * for. The pattern finds whatever edition is published now; the fallback is what was current when
 * this was written, so a failed lookup still answers rather than losing the country.
 *
 * The layer index is resolved rather than assumed for the same reason: the wired map's single
 * layer sits at index 17 and the others at 0, which is not a pattern so much as an accident of how
 * each was published.
 * @type {Record<string, {pattern: RegExp, service: string, layer: number}>}
 */
const MAPS = {
  wired: { pattern: /^CobBAFija_(\d{4})/i, service: 'CobBAFija_2024_vista', layer: 17 },
  fwa: { pattern: /^CobFWA_(\d{4})/i, service: 'CobFWA_2024_Vista', layer: 0 },
  mobile4g: { pattern: /^InfoCob4G_(\d{4})/i, service: 'InfoCob4G_2024', layer: 0 },
  mobile5g: { pattern: /^InfoCob5G_(\d{4})/i, service: 'InfoCob5G_2025', layer: 0 },
};

/** How long a resolved set of editions is trusted before it is looked up again. */
const EDITION_TTL = 24 * 60 * 60 * 1000;

/**
 * How far around the coordinate the fixed-line maps are asked, in metres.
 *
 * A parcel map cannot be queried with a bare point: a geocoded address lands on the pavement in
 * front of the building as often as on it, and the pavement belongs to no parcel. Forty metres is
 * wide enough to catch the building whatever the geocoder rounded to, and narrow enough to stay
 * inside the block - the neighbours caught along with it share the same street cabinet, which is
 * what decides the answer.
 */
const FIXED_RADIUS_METRES = 40;

/**
 * How far around the coordinate the mobile maps are asked, in metres.
 *
 * Smaller, because these are continuous 50m coverage squares rather than parcels: there is no gap
 * to bridge, only the chance of sitting exactly on a boundary.
 */
const MOBILE_RADIUS_METRES = 25;

/**
 * How many features are folded into one answer.
 *
 * A forty-metre circle over a dense block touches a couple of dozen parcels; the mobile maps
 * overlap at most a handful of squares. Applied after the answer arrives rather than sent as
 * `resultRecordCount`, which the service cannot be asked for: a small count makes it hang until it
 * times out, or reply "Cannot perform query. Invalid query parameters." with a 200. A large count
 * and no count at all both answer in a fifth of a second, so the ceiling is kept on this side.
 */
const FIXED_RECORD_LIMIT = 25;
const MOBILE_RECORD_LIMIT = 5;

const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: 1000 });

/** ArcGIS Online publishes no rate limit for anonymous queries; the house limit applies. */
const throttle = pThrottle({ limit: 2, interval: 1000 });

const REQUEST_TIMEOUT = 15000;

/** How long the client stands off after the service refused or failed to answer. */
const PAUSE_DURATION = 15 * 60 * 1000;

let pausedSince = 0;

/** @type {{value: Record<string, {service: string, layer: number}>, expiresAt: number}|null} */
let editionCache = null;

/**
 * Whether the client is currently standing off after a failure.
 *
 * @returns {boolean}
 */
export function isCoberturaEsPaused() {
  return Date.now() - pausedSince < PAUSE_DURATION;
}

/**
 * Clears the client's memory of failures and editions. Only used by the tests.
 *
 * @returns {void}
 */
export function resetCoberturaEsClient() {
  pausedSince = 0;
  editionCache = null;
}

/**
 * Runs a GET and parses the body as JSON.
 *
 * @param {string} url
 * @returns {Promise<unknown|null>} `null` for every failure - a listing without connectivity data
 * is a listing that renders one line less, never a broken pipeline.
 */
async function getJson(url) {
  try {
    const response = await fetch(url, {
      agent,
      // node-fetch 3 has no `timeout` option any more and ignored it without a word, so a stalled
      // backend held the sweep - which works one listing at a time - until the socket gave up.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      headers: {
        'User-Agent': selfHostedUserAgent,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      logger.error(`The Spanish coverage service responded with ${response.status} ${response.statusText}`);
      pausedSince = Date.now();
      return null;
    }

    const payload = await response.json();
    // ArcGIS reports its own errors with a 200 and an `error` object, so the status line alone
    // does not say whether this worked.
    if (payload?.error != null) {
      logger.error(`The Spanish coverage service refused a query: ${payload.error.message ?? 'no reason given'}`);
      pausedSince = Date.now();
      return null;
    }
    return payload;
  } catch (error) {
    logger.error('Error during Spanish coverage request:', error);
    pausedSince = Date.now();
    return null;
  }
}

const throttledGetJson = throttle(getJson);

/**
 * The service whose name carries the highest year among those matching a pattern.
 *
 * The organisation publishes a hundred and sixty services, several editions of some of them side
 * by side, and the old ones are left up rather than withdrawn. Sorting by the year in the name is
 * the only ordering available - the catalogue lists no dates.
 *
 * @param {string[]} names Every service the organisation publishes.
 * @param {RegExp} pattern Anchored at the start, with the year as its first capture.
 * @returns {string|null} `null` when nothing matches.
 */
export function newestEdition(names, pattern) {
  let best = null;
  let bestYear = -Infinity;

  for (const name of names) {
    const year = Number(pattern.exec(name)?.[1]);
    if (Number.isFinite(year) && year > bestYear) {
      best = name;
      bestYear = year;
    }
  }

  return best;
}

/**
 * The newest published edition of one map, with the index of its layer.
 *
 * @param {string[]} names Every service the organisation publishes.
 * @param {{pattern: RegExp, service: string, layer: number}} map
 * @returns {Promise<{service: string, layer: number}>} The built-in default when nothing matches
 * or the layer cannot be read.
 */
async function resolveMap(names, map) {
  const service = newestEdition(names, map.pattern);
  if (service == null) {
    return { service: map.service, layer: map.layer };
  }

  const description = await throttledGetJson(`${HOST}/${service}/FeatureServer?f=json`);
  const layer = description?.layers?.[0]?.id;
  if (!Number.isInteger(layer)) {
    return { service: map.service, layer: map.layer };
  }

  return { service, layer };
}

/**
 * Resolves which edition of each map to query.
 *
 * @returns {Promise<Record<string, {service: string, layer: number}>>}
 */
async function resolveEditions() {
  if (editionCache != null && editionCache.expiresAt > Date.now()) {
    return editionCache.value;
  }

  const catalogue = await throttledGetJson(`${HOST}?f=json`);
  const names = Array.isArray(catalogue?.services)
    ? catalogue.services.map((service) => String(service?.name ?? '')).filter(Boolean)
    : null;

  if (names == null) {
    logger.debug('Could not read the published Spanish coverage editions, using the built-in fallback.');
    // Not cached: the fallback is a guess, and the next lookup should get another chance at the
    // real answer rather than being stuck with it until tomorrow.
    return Object.fromEntries(
      Object.entries(MAPS).map(([key, map]) => [key, { service: map.service, layer: map.layer }]),
    );
  }

  /** @type {Record<string, {service: string, layer: number}>} */
  const value = {};
  for (const [key, map] of Object.entries(MAPS)) {
    value[key] = await resolveMap(names, map);
  }

  editionCache = { value, expiresAt: Date.now() + EDITION_TTL };
  return value;
}

/**
 * Asks one map about one point.
 *
 * @param {{service: string, layer: number}} map
 * @param {number} lat
 * @param {number} lng
 * @param {{fields: string, radius: number, limit: number}} options
 * @returns {Promise<Array<Record<string, unknown>>|null>} The features found, `[]` when the map
 * covers the place and reports nothing there, and `null` for every failure.
 */
async function queryMap(map, lat, lng, { fields, radius, limit }) {
  const query = new URLSearchParams({
    f: 'json',
    // A buffered point rather than a hand-built box: the service does the geodesy, which spares
    // the client the correction a rectangle in degrees needs to stay square on the ground.
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    distance: String(radius),
    units: 'esriSRUnit_Meter',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: fields,
    returnGeometry: 'false',
  });

  const payload = await throttledGetJson(`${HOST}/${map.service}/FeatureServer/${map.layer}/query?${query}`);
  if (payload == null) {
    return null;
  }

  const features = payload?.features;
  if (!Array.isArray(features)) {
    return [];
  }
  return features.slice(0, limit).map((feature) => feature?.attributes ?? {});
}

/**
 * Looks up broadband and mobile coverage for one coordinate in Spain.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<import('../normalize.js').Connectivity|null>} `null` when nothing is known
 * about the place or the lookup failed.
 */
export async function fetchSpanishConnectivity(lat, lng) {
  if (isCoberturaEsPaused()) {
    return null;
  }

  const editions = await resolveEditions();
  const fixed = { fields: 'Velocidad,Cobertura', radius: FIXED_RADIUS_METRES, limit: FIXED_RECORD_LIMIT };
  const mobile = { fields: 'COBERTURA', radius: MOBILE_RADIUS_METRES, limit: MOBILE_RECORD_LIMIT };

  // One map at a time, and each one skipped once the service has started refusing: four maps means
  // four requests per listing, which is twice what any other source costs, and a sweep that keeps
  // asking after the first refusal would be four times as rude as it needs to be.
  const ask = async (key, options) => (isCoberturaEsPaused() ? null : await queryMap(editions[key], lat, lng, options));

  const wired = await ask('wired', fixed);
  // Fixed wireless is only interesting where no line arrives. Skipping it over the cities - which
  // is most listings - keeps the common case at three requests instead of four, and the answer is
  // unchanged either way, because a radio link never beats the fibre next to it.
  const fwa = wired != null && wired.length > 0 ? [] : await ask('fwa', fixed);
  const mobile4g = await ask('mobile4g', mobile);
  const mobile5g = await ask('mobile5g', mobile);

  // All four or nothing. Every other source asks once or twice, so a half-answer is barely
  // possible; Spain asks four times, and a map that times out looks exactly like a map reporting
  // that nothing is there. Folding the three that answered into a record would store "no fixed
  // line" for an address on fibre, and the sweep stamps what it stores and does not come back for
  // half a year. Returning nothing instead leaves the client paused, which is what makes the sweep
  // skip the listing and pick it up again on the next run.
  if (wired == null || fwa == null || mobile4g == null || mobile5g == null) {
    return null;
  }

  return normalizeSpanish({ wired, fwa, mobile4g, mobile5g });
}
