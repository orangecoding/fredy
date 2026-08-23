/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getSettings } from '../storage/settingsStorage.js';
import { cached, cacheKey, clearConnectivityCache } from './connectivityCache.js';
import { sourceForCountries, SOURCES, SOURCE_IDS } from './sources.js';
import { packMobile } from './mobileBits.js';
import logger from '../logger.js';

/**
 * What internet connection a place has, and which mobile networks reach it.
 *
 * This is the only door into the connectivity feature. It decides whether the feature is on at
 * all, which register answers for the place in question, and it keeps the result so a street full
 * of listings costs one lookup rather than thirty.
 */

export { clearConnectivityCache };

/** Default ceiling on how many listings one enrichment sweep works through. @type {number} */
export const DEFAULT_CONNECTIVITY_LIMIT_PER_RUN = 200;

/**
 * Default age at which a stored answer is looked up again.
 *
 * The registers behind this are refreshed twice a year, so half a year is the point at which a
 * stored answer might genuinely have changed. It doubles as the retry interval for a listing whose
 * lookup failed, which is why it is not longer.
 * @type {number}
 */
export const DEFAULT_CONNECTIVITY_MAX_AGE_DAYS = 180;

/**
 * Whether the operator has the feature switched on.
 *
 * Read per call rather than captured at import time, so flipping the switch takes effect without a
 * restart. Enforced here rather than only in the UI: a sweep already in flight when the switch is
 * turned off must stop making requests, not finish its batch.
 *
 * @param {Record<string, any>} [settings] Already-loaded settings, when the caller has them.
 * @returns {Promise<boolean>}
 */
export async function isConnectivityEnabled(settings) {
  const resolved = settings ?? (await getSettings());
  return resolved?.connectivityEnabled === true;
}

/**
 * Whether one register is switched on.
 *
 * Absent means on. An operator who has never opened the settings page should get the feature as
 * shipped, and a source added in a later release must not be silently off on every instance that
 * upgraded.
 *
 * @param {Record<string, any>} settings
 * @param {string} sourceId
 * @returns {boolean}
 */
export function isSourceEnabled(settings, sourceId) {
  const sources = settings?.connectivitySources;
  if (sources == null || typeof sources !== 'object') {
    return true;
  }
  return sources[sourceId] !== false;
}

/**
 * Normalises the per-source switches, dropping anything that is not a source Fredy knows.
 *
 * @param {any} value
 * @returns {Record<string, boolean>}
 */
export function normalizeSourceSwitches(value) {
  const raw = value != null && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(SOURCE_IDS.map((id) => [id, raw[id] !== false]));
}

/**
 * @typedef {Object} ConnectivityResult
 * @property {import('./normalize.js').Connectivity} connectivity
 * @property {string} sourceId
 */

/**
 * Looks up the connectivity of a coordinate.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string[]} countries ISO 3166-1 alpha-2 codes the place could be in.
 * @returns {Promise<ConnectivityResult|null>} `null` when the feature is off, no register covers
 * the place, or the lookup produced nothing.
 */
export async function getConnectivity(lat, lng, countries) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const settings = await getSettings();
  if (!(await isConnectivityEnabled(settings))) {
    return null;
  }

  const source = sourceForCountries(countries);
  if (source == null) {
    logger.debug(`No connectivity register covers ${JSON.stringify(countries)}.`);
    return null;
  }

  if (!isSourceEnabled(settings, source.id)) {
    return null;
  }

  const connectivity = await cached(cacheKey(source.id, lat, lng), () => source.fetch(lat, lng));
  if (connectivity == null) {
    return null;
  }

  return { connectivity, sourceId: source.id };
}

/**
 * The columns a lookup result is stored in.
 *
 * The readable answer lives in one JSON column, and three flat ones carry the parts the listings
 * overview filters on. They are duplicated rather than extracted from the JSON at query time
 * because that filter runs as a WHERE clause over the whole table, and an expression over JSON
 * cannot use an index.
 *
 * @param {import('./normalize.js').Connectivity|null} connectivity
 * @returns {{maxDown: number|null, fiber: number|null, mobile: number|null}}
 */
export function toColumns(connectivity) {
  if (connectivity == null) {
    return { maxDown: null, fiber: null, mobile: null };
  }
  return {
    maxDown: connectivity.maxDownMbit,
    fiber: connectivity.fiber ? 1 : 0,
    mobile: packMobile(connectivity.mobile),
  };
}

/**
 * Whether a source is currently standing off after failures.
 *
 * A sweep asks before each listing, so a register that has gone away costs one failed request per
 * run instead of one per listing.
 *
 * @param {string} sourceId
 * @returns {boolean} False for an id no source claims, which cannot be paused because it is never
 * asked anything.
 */
export function isSourcePaused(sourceId) {
  const source = SOURCES.find((candidate) => candidate.id === sourceId);
  return source != null && source.isPaused();
}
