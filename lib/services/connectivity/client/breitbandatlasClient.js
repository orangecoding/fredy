/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import https from 'https';
import fetch from 'node-fetch';
import pThrottle from 'p-throttle';
import logger from '../../logger.js';
import { DE_DOWNSTREAM_CLASSES, DE_TECHNOLOGIES, normalizeGerman } from '../normalize.js';
import { TECHNOLOGIES, OPERATOR_CODES } from '../mobileBits.js';

/**
 * Client for the German broadband and mobile register behind the Breitbandatlas, published by the
 * Bundesnetzagentur.
 *
 * The register is organised as a 100m grid: one record per cell, carrying the share of households
 * that can get each combination of technology and speed, plus which mobile operators reach it.
 * Fredy asks for the cell a listing sits in and keeps the answer.
 *
 * The data may be used freely for any purpose as long as the source is named, which the detail
 * page does; see the attribution line in `ConnectivityCard`.
 */

/** Where the register is served from. */
const HOST = 'https://brgp.prod.gigabit-grundbuch.online/server/rest/services/Hosted';

/** Where the published data set announces which edition is current. */
const CONFIG_URL = 'https://breitbandatlas.gigabit-grundbuch.online/app/shared/config/configLayerList.json';

/**
 * Referrer sent with every request.
 *
 * The register is served as part of the Breitbandatlas and answers requests that name it.
 */
const REFERRER = 'https://breitbandatlas.gigabit-grundbuch.online/';

/**
 * The editions to fall back on when the current ones cannot be read.
 *
 * Each half of the register is versioned separately and moves roughly twice a year, in step with
 * the reporting obligation the operators are under. Stale numbers still answer - the previous
 * edition stays online - so falling back is better than giving up on the lookup.
 */
const FALLBACK_VERSIONS = { fixed: '014', mobile: '012' };

/** How long a resolved edition is trusted before it is looked up again. */
const VERSION_TTL = 24 * 60 * 60 * 1000;

/**
 * Half-width of the box a cell is looked up with, in metres.
 *
 * A point query is the obvious thing to do and the wrong one: a coordinate that lands exactly on a
 * cell boundary belongs to no cell and comes back empty, which happens often enough to matter
 * because geocoders like to return round numbers. Sixty metres is smaller than a cell, so the box
 * cannot skip one, and large enough that no boundary can fall outside it.
 */
const ENVELOPE_METRES = 60;

/** Metres per degree of latitude. Close enough anywhere the register has data. */
const METRES_PER_DEGREE = 111320;

/**
 * The connection to the register, with certificate verification turned off.
 *
 * The register sends its leaf certificate alone, without the Let's Encrypt intermediate above it,
 * and that intermediate belongs to a root ("ISRG Root YE") young enough that no root store carries
 * it yet. Browsers and curl connect anyway because they download the missing certificates from the
 * pointer every certificate carries; Node does not do that, so it refuses the handshake with
 * `UNABLE_TO_VERIFY_LEAF_SIGNATURE` although nothing is wrong with the certificate. Walking those
 * pointers here is a lot of machinery for a server-side mistake that may be gone next week.
 *
 * What this gives up is small: the lookup is a public one, it carries no credentials, no cookies and
 * nothing about the user, and the answer is coverage figures that end up on a listing. The worst a
 * man in the middle gets out of it is the chance to lie about who has fibre. Nothing else in Fredy
 * uses this agent.
 */
const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: 1000, rejectUnauthorized: false });

/**
 * The register is a public service without a published rate limit. Two requests per second is far
 * below what one household's listings produce and leaves the service alone during a backlog sweep.
 */
const throttle = pThrottle({ limit: 2, interval: 1000 });

const REQUEST_TIMEOUT = 15000;

/**
 * How long the client stands off after the register refused or failed to answer.
 *
 * Without this a sweep with a few hundred listings would keep asking a service that has already
 * said no, which is both pointless and the behaviour most likely to get an instance blocked.
 */
const PAUSE_DURATION = 15 * 60 * 1000;

let pausedSince = 0;

/** @type {{value: {fixed: string, mobile: string}, expiresAt: number}|null} */
let versionCache = null;

/**
 * Whether the client is currently standing off after a failure.
 *
 * A sweep checks this before each listing so that a dead service costs one request per run rather
 * than one per listing - the same reason the geocoding sweep consults `isGeocodingPaused()`.
 *
 * @returns {boolean}
 */
export function isBreitbandatlasPaused() {
  return Date.now() - pausedSince < PAUSE_DURATION;
}

/**
 * Clears the client's memory of failures and editions. Only used by the tests.
 *
 * @returns {void}
 */
export function resetBreitbandatlasClient() {
  pausedSince = 0;
  versionCache = null;
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
      timeout: REQUEST_TIMEOUT,
      headers: {
        Accept: 'application/json',
        Referer: REFERRER,
      },
    });

    if (!response.ok) {
      logger.error(`Breitbandatlas responded with ${response.status} ${response.statusText}`);
      pausedSince = Date.now();
      return null;
    }

    return await response.json();
  } catch (error) {
    logger.error('Error during Breitbandatlas request:', error);
    pausedSince = Date.now();
    return null;
  }
}

const throttledGetJson = throttle(getJson);

/**
 * Resolves which edition of each half of the register to query.
 *
 * The edition is part of the service name, so a hard-coded one stops answering the day a new data
 * release lands. Read once a day from the data set's own configuration instead.
 *
 * @returns {Promise<{fixed: string, mobile: string}>}
 */
async function resolveVersions() {
  if (versionCache != null && versionCache.expiresAt > Date.now()) {
    return versionCache.value;
  }

  const config = await throttledGetJson(CONFIG_URL);
  const value = {
    fixed: typeof config?.stationaryVersion === 'string' ? config.stationaryVersion : FALLBACK_VERSIONS.fixed,
    mobile: typeof config?.mobileVersion === 'string' ? config.mobileVersion : FALLBACK_VERSIONS.mobile,
  };

  if (config == null) {
    logger.debug('Could not read the current Breitbandatlas edition, using the built-in fallback.');
    // Not cached for a day: the fallback is a guess, and the next lookup should get another chance
    // at the real answer rather than being stuck with it until tomorrow.
    return value;
  }

  versionCache = { value, expiresAt: Date.now() + VERSION_TTL };
  return value;
}

/**
 * The query string for one cell lookup.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string[]} outFields
 * @returns {string}
 */
function cellQuery(lat, lng, outFields) {
  const dLat = ENVELOPE_METRES / METRES_PER_DEGREE;
  // Degrees of longitude shrink towards the poles, so the box would be far narrower than intended
  // in northern Germany if this used the same delta as the latitude.
  const dLng = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.1);

  const geometry = {
    xmin: lng - dLng,
    ymin: lat - dLat,
    xmax: lng + dLng,
    ymax: lat + dLat,
    spatialReference: { wkid: 4326 },
  };

  return new URLSearchParams({
    f: 'json',
    geometry: JSON.stringify(geometry),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: outFields.join(','),
    returnGeometry: 'false',
    resultRecordCount: '1',
  }).toString();
}

/**
 * The fixed-line fields worth asking for.
 *
 * Named explicitly rather than requesting everything: the layer carries well over a hundred
 * columns, most of them about business parks, schools and hospitals.
 * @returns {string[]}
 */
function fixedFields() {
  const fields = [];
  for (const technology of ['alle', ...DE_TECHNOLOGIES]) {
    for (const mbit of DE_DOWNSTREAM_CLASSES) {
      fields.push(`down_fn_hh_${technology}_${mbit}`);
    }
  }
  return fields;
}

/**
 * The mobile fields worth asking for: the best technology, plus availability per technology both
 * provider-neutral and per operator.
 * @returns {string[]}
 */
function mobileFields() {
  const fields = ['beste_tech'];
  for (const tech of TECHNOLOGIES) {
    fields.push(`verf_${tech}`);
    for (const code of OPERATOR_CODES) {
      fields.push(`verf_${tech}_${code}`);
    }
  }
  return fields;
}

/**
 * Reads the attributes of the first cell an answer contains.
 *
 * @param {unknown} payload
 * @returns {Record<string, unknown>|null}
 */
function firstCell(payload) {
  const features = payload?.features;
  if (!Array.isArray(features) || features.length === 0) {
    return null;
  }
  return features[0]?.attributes ?? null;
}

/**
 * Looks up broadband and mobile coverage for one coordinate in Germany.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<import('../normalize.js').Connectivity|null>} `null` when nothing is known
 * about the place or the lookup failed.
 */
export async function fetchGermanConnectivity(lat, lng) {
  if (isBreitbandatlasPaused()) {
    return null;
  }

  const versions = await resolveVersions();

  // Sequential rather than in parallel: the throttle would serialise them anyway, and doing it
  // here means a first request that trips the stand-off spares the second one entirely.
  const fixed = await throttledGetJson(
    `${HOST}/festnetz_${versions.fixed}/FeatureServer/0/query?${cellQuery(lat, lng, fixedFields())}`,
  );
  const mobile = isBreitbandatlasPaused()
    ? null
    : await throttledGetJson(
        `${HOST}/mobilfunk_${versions.mobile}/FeatureServer/0/query?${cellQuery(lat, lng, mobileFields())}`,
      );

  if (fixed == null && mobile == null) {
    return null;
  }

  return normalizeGerman(firstCell(fixed), firstCell(mobile));
}
