/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import https from 'https';
import fetch from 'node-fetch';
import pThrottle from 'p-throttle';
import logger from '../../logger.js';
import { selfHostedUserAgent } from '../../userAgent.js';
import { normalizeAustrian } from '../normalize.js';

/**
 * Client for the Austrian broadband and mobile register behind the Breitbandatlas, published by
 * the federal ministry from the data RTR-GmbH collects from the operators.
 *
 * The register is a 100m grid like the German one, but it answers a different question. Germany
 * publishes what share of a cell's households can get a speed class; Austria publishes the offers
 * themselves - this company, this technology, this many Mbit/s down and up - and for mobile it
 * adds what its own Netztest app has actually measured there. That is the richest of the four
 * sources Fredy asks, and it is the reason `sharePercent` stays empty for Austria: there is no
 * share in the data, because nothing is being averaged.
 *
 * The data is published under CC BY 3.0 AT, which the detail page satisfies through the
 * attribution line in `ConnectivityCard`.
 */

/**
 * Where the register answers point queries.
 *
 * This is the Breitbandatlas' own backend rather than a documented API. There is no other way in:
 * the map tiles come from a WMS proxy that answers `GetMap` and refuses `GetFeatureInfo`, and the
 * only machine-readable alternative the ministry offers is a bulk download of the whole grid,
 * which is the wrong shape for looking up one address. The endpoint takes no key, sets no cookie
 * and is the same request the public map makes when somebody clicks a cell.
 */
const ENDPOINT = 'https://breitbandatlas.gv.at/backend/data/getresults.php';

/**
 * The two halves of the register, as the backend names them.
 *
 * There is a third, `Geförderter Ausbau` - which cells are in a subsidised rollout - and it is
 * left alone on purpose. A planned build is not a connection anybody can order, and putting it on
 * a listing would promise a speed that is years away.
 * @type {{fixed: string, mobile: string}}
 */
const THEMES = { fixed: 'Festnetz', mobile: 'Mobilfunknetz' };

/** Half the circumference of the Earth in Web Mercator metres, which is the projection's edge. */
const MERCATOR_HALF_WIDTH = 20037508.34;

const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: 1000 });

/**
 * The register is a public service without a published rate limit, so it gets the same two
 * requests per second the German and Swiss clients settled on.
 */
const throttle = pThrottle({ limit: 2, interval: 1000 });

const REQUEST_TIMEOUT = 15000;

/** How long the client stands off after the register refused or failed to answer. */
const PAUSE_DURATION = 15 * 60 * 1000;

let pausedSince = 0;

/**
 * Whether the client is currently standing off after a failure.
 *
 * @returns {boolean}
 */
export function isBreitbandatlasAtPaused() {
  return Date.now() - pausedSince < PAUSE_DURATION;
}

/**
 * Clears the client's memory of failures. Only used by the tests.
 *
 * @returns {void}
 */
export function resetBreitbandatlasAtClient() {
  pausedSince = 0;
}

/**
 * Projects a coordinate into Web Mercator, which is what the backend expects.
 *
 * It takes no projection parameter and no degrees: `x` and `y` are EPSG:3857 metres, the same
 * numbers the map's own tile grid runs on. Latitudes are clamped short of the poles, where the
 * projection goes to infinity - not because Austria reaches them, but because a geocoder that
 * returned nonsense should produce an empty answer rather than `Infinity` in a query string.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {{x: number, y: number}}
 */
export function toWebMercator(lat, lng) {
  const clamped = Math.min(Math.max(lat, -85.05112878), 85.05112878);
  return {
    x: (lng * MERCATOR_HALF_WIDTH) / 180,
    y: (Math.log(Math.tan(((90 + clamped) * Math.PI) / 360)) / (Math.PI / 180)) * (MERCATOR_HALF_WIDTH / 180),
  };
}

/**
 * Asks one theme about one point.
 *
 * @param {string} theme One of `THEMES`.
 * @param {number} x Web Mercator easting.
 * @param {number} y Web Mercator northing.
 * @returns {Promise<Array<Record<string, unknown>>|null>} The providers the cell carries, `[]` when
 * the register knows the cell and nobody serves it, and `null` for every failure.
 */
async function get(theme, x, y) {
  const query = new URLSearchParams({ thema: theme, x: String(x), y: String(y) });

  try {
    const response = await fetch(`${ENDPOINT}?${query}`, {
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
      logger.error(`breitbandatlas.gv.at responded with ${response.status} ${response.statusText}`);
      pausedSince = Date.now();
      return null;
    }

    const payload = await response.json();
    const providers = payload?.data?.anbieter;
    // A cell outside the grid comes back without the array rather than with an empty one, and the
    // difference matters: "nobody serves this" is an answer, "the backend did not say" is not.
    return Array.isArray(providers) ? providers : null;
  } catch (error) {
    logger.error('Error during breitbandatlas.gv.at request:', error);
    pausedSince = Date.now();
    return null;
  }
}

const throttledGet = throttle(get);

/**
 * Looks up broadband and mobile coverage for one coordinate in Austria.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<import('../normalize.js').Connectivity|null>} `null` when nothing is known
 * about the place or the lookup failed.
 */
export async function fetchAustrianConnectivity(lat, lng) {
  if (isBreitbandatlasAtPaused()) {
    return null;
  }

  const { x, y } = toWebMercator(lat, lng);

  // Sequential rather than in parallel, for the same reason as Germany: the throttle would
  // serialise them anyway, and a first request that trips the stand-off spares the second one.
  const fixed = await throttledGet(THEMES.fixed, x, y);
  const mobile = isBreitbandatlasAtPaused() ? null : await throttledGet(THEMES.mobile, x, y);

  // All or nothing, as for Spain. A failure on either request pauses the client, and half an answer
  // stored anyway ("no mobile data") would be stamped as the answer for the next 180 days. Nothing
  // returned instead leaves the listing to the next sweep.
  if (isBreitbandatlasAtPaused()) {
    return null;
  }

  return normalizeAustrian(fixed, mobile);
}
