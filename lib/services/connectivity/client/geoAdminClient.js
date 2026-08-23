/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import https from 'https';
import fetch from 'node-fetch';
import pThrottle from 'p-throttle';
import logger from '../../logger.js';
import { selfHostedUserAgent } from '../../userAgent.js';
import { CH_DOWNSTREAM_CLASSES, normalizeSwiss } from '../normalize.js';

/**
 * Client for the Swiss broadband and mobile coverage maps published by the BAKOM through the
 * federal geodata service.
 *
 * Unlike the German register this is a map service rather than a feature service: each speed class
 * is its own layer, and a point query returns the class number the pixel is painted with. That is
 * coarser - four bands of building share rather than a percentage - but it is a documented,
 * openly available interface that needs no key.
 */

const ENDPOINT = 'https://wms.geo.admin.ch/';

/**
 * The layers asked for.
 *
 * All of them travel in one request. The service refuses to write GeoJSON for several layers at
 * once, but its plain-text format handles the whole set, which turns nine lookups into one - worth
 * the hand-written parser below.
 * @type {string[]}
 */
const LAYERS = [
  ...CH_DOWNSTREAM_CLASSES.map((mbit) => `ch.bakom.downlink${mbit}`),
  'ch.bakom.anschlussart-glasfaser',
  'ch.bakom.mobilnetz-4g',
  'ch.bakom.mobilnetz-5g',
];

/**
 * Pixel size of the imaginary map the query is made against.
 *
 * The service answers "what is at pixel I,J of this map", so a map has to be described even though
 * no image is wanted. An odd number keeps the centre pixel exactly on the requested coordinate.
 */
const IMAGE_SIZE = 101;

/** Half-width of the described map, in degrees. About a hundred metres, well inside one square. */
const HALF_SPAN_DEGREES = 0.001;

const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: 1000 });

const throttle = pThrottle({ limit: 2, interval: 1000 });

const REQUEST_TIMEOUT = 15000;

/** How long the client stands off after the service refused or failed to answer. */
const PAUSE_DURATION = 15 * 60 * 1000;

let pausedSince = 0;

/**
 * Whether the client is currently standing off after a failure.
 *
 * @returns {boolean}
 */
export function isGeoAdminPaused() {
  return Date.now() - pausedSince < PAUSE_DURATION;
}

/**
 * Clears the client's memory of failures. Only used by the tests.
 *
 * @returns {void}
 */
export function resetGeoAdminClient() {
  pausedSince = 0;
}

/**
 * Pulls the class numbers out of the service's plain-text answer.
 *
 * The format is one indented `<layer>.value_0.name = '<n>'` line per layer that had something to
 * say; layers with no data at the point are simply absent, which is the difference between "no
 * coverage" and "nothing known here" and has to survive into the result.
 *
 * @param {string} body
 * @returns {Record<string, number>} Class number per layer id.
 */
export function parseFeatureInfo(body) {
  /** @type {Record<string, number>} */
  const bands = {};

  for (const match of body.matchAll(/^\s*([\w.-]+)\.value_0\.name\s*=\s*'([^']*)'/gm)) {
    const value = Number(match[2]);
    if (Number.isFinite(value)) {
      bands[match[1]] = value;
    }
  }

  return bands;
}

/**
 * Runs the point query.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string|null>} The raw body, or `null` for every failure.
 */
async function get(lat, lng) {
  const layers = LAYERS.join(',');
  const query = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: layers,
    QUERY_LAYERS: layers,
    // CRS:84 rather than EPSG:4326 - in WMS 1.3.0 the latter expects latitude first, and getting
    // that backwards silently returns the coverage of somewhere in the Indian Ocean.
    CRS: 'CRS:84',
    BBOX: [lng - HALF_SPAN_DEGREES, lat - HALF_SPAN_DEGREES, lng + HALF_SPAN_DEGREES, lat + HALF_SPAN_DEGREES].join(
      ',',
    ),
    WIDTH: String(IMAGE_SIZE),
    HEIGHT: String(IMAGE_SIZE),
    I: String((IMAGE_SIZE - 1) / 2),
    J: String((IMAGE_SIZE - 1) / 2),
    INFO_FORMAT: 'text/plain',
  });

  try {
    const response = await fetch(`${ENDPOINT}?${query}`, {
      agent,
      timeout: REQUEST_TIMEOUT,
      headers: {
        'User-Agent': selfHostedUserAgent,
        Accept: 'text/plain',
      },
    });

    if (!response.ok) {
      logger.error(`geo.admin.ch responded with ${response.status} ${response.statusText}`);
      pausedSince = Date.now();
      return null;
    }

    return await response.text();
  } catch (error) {
    logger.error('Error during geo.admin.ch request:', error);
    pausedSince = Date.now();
    return null;
  }
}

const throttledGet = throttle(get);

/**
 * Looks up broadband and mobile coverage for one coordinate in Switzerland.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<import('../normalize.js').Connectivity|null>}
 */
export async function fetchSwissConnectivity(lat, lng) {
  if (isGeoAdminPaused()) {
    return null;
  }

  const body = await throttledGet(lat, lng);
  if (body == null) {
    return null;
  }

  // A map service reports its own errors with a 200 and an XML body, so an unparseable answer is
  // not necessarily a place without coverage.
  if (body.includes('ServiceException')) {
    logger.error('geo.admin.ch returned a service exception for a coverage lookup.');
    pausedSince = Date.now();
    return null;
  }

  return normalizeSwiss(parseFeatureInfo(body));
}
