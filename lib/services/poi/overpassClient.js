/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import https from 'https';
import fetch from 'node-fetch';
import pThrottle from 'p-throttle';
import logger from '../logger.js';
import { selfHostedUserAgent } from '../userAgent.js';
import { getSettings } from '../storage/settingsStorage.js';
import { PLACE_CATEGORIES } from './categories.js';

/**
 * Thin client for the Overpass API, the query interface to OpenStreetMap's raw data.
 *
 * Treated exactly like Nominatim and Transitous, and for the same reason: it is a free community
 * service with no key, run on donated hardware, and the only thing Fredy owes it in return is not
 * behaving like a scraper. So: one request at a time, a self-identifying User-Agent, and an
 * escalating stand-off the moment it says no.
 *
 * What keeps the request count low is not in this file. Answers are cached per grid cell in the
 * database (see `poiCacheStorage.js`), so a city block's worth of listings costs one query and a
 * restart does not throw that away.
 */
const DEFAULT_API_URL = 'https://overpass-api.de/api/interpreter';

/**
 * How long Overpass is given to run one query, in seconds.
 *
 * Part of the query itself rather than only a client-side timeout: Overpass schedules work against
 * this number, and a query that declares a small budget is let through when a greedy one would be
 * queued. Ten seconds is generous for a bounded `around` search.
 */
const QUERY_TIMEOUT_SECONDS = 10;

/** Ceiling on elements one query may return. Beyond this the extras are never the nearest anyway. */
const MAX_ELEMENTS = 60;

const agent = new https.Agent({ keepAlive: true, keepAliveMsecs: 1000 });

// One at a time. Overpass publishes a two-slot limit per IP and counts a queued query against it,
// so a second concurrent request buys nothing and risks the stand-off below.
const throttle = pThrottle({ limit: 1, interval: 1000 });

const REQUEST_TIMEOUT = 30000;

/**
 * The stand-off curve, identical in shape to the Nominatim client's.
 *
 * Overpass answers a refusal in two ways - 429 when the rate limit is hit and 504 when the query
 * ran out of its slot - and both mean the same thing to us: stop asking for a while. A blip costs a
 * minute; a sustained refusal escalates to an hour. Any real answer clears the count.
 */
const FIRST_BACKOFF = 60000;
const MAX_BACKOFF = 3600000;

/** Consecutive refusals. Only ever grows the wait; any real answer resets it. */
let consecutiveRefusals = 0;

/** Epoch ms until which no request may be made. */
let backoffUntil = 0;

/**
 * How long to wait after this many consecutive refusals.
 *
 * Exported so the curve can be checked without a clock, the same way the Nominatim client does it:
 * the state around it lives behind a throttle, and a test that fast-forwards time deadlocks the
 * throttle's own timer.
 *
 * @param {number} consecutive - Refusals in a row, counting this one. One-based.
 * @returns {number} Milliseconds.
 */
export function backoffFor(consecutive) {
  const steps = Math.max(1, Math.floor(consecutive)) - 1;
  return Math.min(FIRST_BACKOFF * 2 ** steps, MAX_BACKOFF);
}

/**
 * Record a refusal and extend the stand-off.
 *
 * @param {number} status - What Overpass answered, for the log line.
 * @returns {void}
 */
function noteRefusal(status) {
  consecutiveRefusals += 1;
  const wait = backoffFor(consecutiveRefusals);
  backoffUntil = Date.now() + wait;
  logger.warn(
    `Overpass refused with ${status} (${consecutiveRefusals} in a row). Pausing place lookups for ${Math.round(wait / 1000)}s.`,
  );
}

/**
 * Record that Overpass answered, whatever it answered.
 *
 * @returns {void}
 */
function noteAnswered() {
  consecutiveRefusals = 0;
}

/**
 * Whether place lookups are currently being left alone.
 *
 * The sweeper checks this before spending a listing's turn, the same way it checks
 * `isTransitPaused()`: a listing that could not be looked at must stay due rather than be recorded
 * as having no nearby places.
 *
 * @returns {boolean}
 */
export function isOverpassPaused() {
  return Date.now() < backoffUntil;
}

/**
 * The endpoint to query.
 *
 * A setting rather than a constant, read per request so changing it needs no restart, because
 * overpass-api.de is one of several public instances and an operator who leans on this feature
 * should be able to point at their own. A broken settings read falls back to the public instance
 * rather than taking place lookups down with it.
 *
 * @returns {Promise<string>}
 */
async function resolveApiUrl() {
  try {
    const configured = (await getSettings())?.overpassBaseUrl;
    if (typeof configured === 'string' && configured.trim().length > 0) {
      return configured.trim().replace(/\/+$/, '');
    }
  } catch (error) {
    logger.error('Could not read overpassBaseUrl, falling back to the public Overpass endpoint:', error);
  }
  return DEFAULT_API_URL;
}

/**
 * The Overpass QL for one category around one point.
 *
 * `nwr` covers nodes, ways and relations in one clause, because a supermarket is a node in one town
 * and a building outline in the next, and a query that only asked for nodes would quietly miss half
 * of them. `out center` then collapses whichever it found to a single coordinate.
 *
 * @param {string} category - A key of {@link PLACE_CATEGORIES}. Assumed valid; the caller validates.
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusMeters
 * @returns {string}
 */
function buildQuery(category, lat, lng, radiusMeters) {
  const clauses = PLACE_CATEGORIES[category].tags
    .map(([key, value]) => `nwr["${key}"="${value}"](around:${Math.round(radiusMeters)},${lat},${lng});`)
    .join('\n  ');
  return `[out:json][timeout:${QUERY_TIMEOUT_SECONDS}];\n(\n  ${clauses}\n);\nout center ${MAX_ELEMENTS};`;
}

/**
 * The coordinate of one element, whichever shape it arrived in.
 *
 * @param {Object} element
 * @returns {{lat: number, lng: number}|null}
 */
function coordsOf(element) {
  const lat = Number(element?.lat ?? element?.center?.lat);
  const lng = Number(element?.lon ?? element?.center?.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * What to call a place.
 *
 * The name if it has one, then the brand, then the operator. A place with none of those is kept
 * anyway and named by the caller: an unnamed supermarket is still a supermarket, and dropping it
 * would make the nearest one wrong.
 *
 * @param {Object} element
 * @returns {string}
 */
function nameOf(element) {
  const tags = element?.tags ?? {};
  for (const candidate of [tags.name, tags.brand, tags.operator]) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return '';
}

/**
 * Every place of one category within a radius of a point.
 *
 * @param {Object} params
 * @param {string} params.category
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {number} params.radiusMeters
 * @returns {Promise<Array<{name: string, lat: number, lng: number}>|null>} `null` when the lookup
 * failed, which is not the same as an empty array - that means there is genuinely nothing there.
 * The distinction is what stops a failed query being cached as "no supermarkets in this town".
 */
async function doFindPlaces({ category, lat, lng, radiusMeters }) {
  if (isOverpassPaused()) {
    return null;
  }

  const url = await resolveApiUrl();
  const body = new URLSearchParams({ data: buildQuery(category, lat, lng, radiusMeters) });

  try {
    const response = await fetch(url, {
      method: 'POST',
      agent,
      timeout: REQUEST_TIMEOUT,
      body,
      headers: {
        'User-Agent': selfHostedUserAgent,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    // 429 is the rate limit, 504 is "your query did not get a slot". Both say the same thing.
    if (response.status === 429 || response.status === 504) {
      noteRefusal(response.status);
      return null;
    }
    noteAnswered();

    if (!response.ok) {
      logger.error(`Overpass API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data?.elements)) {
      return null;
    }

    const places = [];
    for (const element of data.elements) {
      const coords = coordsOf(element);
      if (coords != null) {
        places.push({ name: nameOf(element), lat: coords.lat, lng: coords.lng });
      }
    }
    return places;
  } catch (error) {
    logger.error('Error during Overpass request:', error);
    return null;
  }
}

export const findPlaces = throttle(doFindPlaces);

/**
 * Forget the current stand-off. For tests only, which would otherwise leak state between cases.
 *
 * @returns {void}
 */
export function __resetRateLimit() {
  consecutiveRefusals = 0;
  backoffUntil = 0;
}

/**
 * The current refusal count. For tests only.
 *
 * @returns {number}
 */
export function __consecutiveRefusals() {
  return consecutiveRefusals;
}

/**
 * End the current wait without touching the escalation. For tests only.
 *
 * @returns {void}
 */
export function __clearBackoff() {
  backoffUntil = 0;
}
