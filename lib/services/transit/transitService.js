/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { fetchNearbyStops, fetchDepartures } from './transitousClient.js';
import { distanceMeters } from '../listings/distanceCalculator.js';

/**
 * Public transport lookups for the map: which stops are near a place, and what leaves from them.
 *
 * Everything is cached in memory and deduplicated per key. The upstream API is a free community
 * service, and the map asks the same questions over and over (the same listing popup, the same
 * stop, several users on one instance), so without this a single browsing session would produce
 * hundreds of upstream calls.
 */

/** Stop positions do not move; a day is only short enough to pick up new stops eventually. */
const STOPS_TTL = 24 * 60 * 60 * 1000;

/** Departures are the whole point of the feature, so they may only be slightly stale. */
const DEPARTURES_TTL = 30 * 1000;

/**
 * A failed lookup is cached too, briefly: it keeps a broken upstream from being hammered by every
 * popup, without a transient error hiding the stops for a whole day.
 */
const FAILURE_TTL = 60 * 1000;

/**
 * Coordinates are rounded to five decimals (about a metre) for the cache key. Two clicks on the
 * same marker must hit the same entry; two different stops must not.
 */
const COORD_PRECISION = 5;

/** @type {Map<string, {expiresAt: number, value: unknown}>} */
const cache = new Map();

/** @type {Map<string, Promise<unknown>>} */
const inFlight = new Map();

/**
 * Reads through the cache, collapsing concurrent misses of the same key into one upstream call.
 *
 * @template T
 * @param {string} key
 * @param {(value: T) => number} ttlFor - Lifetime in milliseconds for the value that was loaded.
 * @param {() => Promise<T>} loader
 * @returns {Promise<T>}
 */
async function cached(key, ttlFor, loader) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return /** @type {T} */ (hit.value);
  }
  // An expired entry is dead weight from here on: either the reload replaces it or it is gone.
  cache.delete(key);

  const running = inFlight.get(key);
  if (running) {
    return /** @type {Promise<T>} */ (running);
  }

  const promise = (async () => {
    const value = await loader();
    cache.set(key, { expiresAt: Date.now() + ttlFor(value), value });
    return value;
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Drops every cached lookup. Only used by the tests, which would otherwise leak state between
 * cases.
 *
 * @returns {void}
 */
export function clearTransitCache() {
  cache.clear();
  inFlight.clear();
}

/**
 * @typedef {Object} NearbyStop
 * @property {string} id
 * @property {string} name
 * @property {number} lat
 * @property {number} lng
 * @property {number} distance - Straight-line metres from the queried coordinate.
 */

/**
 * Finds the public transport stops closest to a coordinate.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} [limit=3] - How many stops to return.
 * @returns {Promise<NearbyStop[]>} Closest first; empty when nothing was found or the lookup failed.
 */
export async function getNearbyStops(lat, lng, limit = 3) {
  const roundedLat = Number(lat.toFixed(COORD_PRECISION));
  const roundedLng = Number(lng.toFixed(COORD_PRECISION));

  // The limit is applied after the cache so that a later, larger request can reuse the entry.
  const stops = await cached(
    `stops:${roundedLat},${roundedLng}`,
    (value) => (value.length > 0 ? STOPS_TTL : FAILURE_TTL),
    async () => {
      const found = await fetchNearbyStops(roundedLat, roundedLng);
      return found
        .map((stop) => ({ ...stop, distance: Math.round(distanceMeters(roundedLat, roundedLng, stop.lat, stop.lng)) }))
        .sort((a, b) => a.distance - b.distance);
    },
  );

  return stops.slice(0, limit);
}

/**
 * Normalizes a name for comparison: the tiles say "U Unter den Linden", the timetable says
 * "U Unter den Linden (Berlin)".
 *
 * @param {string} name
 * @returns {string}
 */
function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9äöüß]+/g, '');
}

/**
 * Resolves the stop a map click refers to.
 *
 * The map's stop dots come from the vector tiles and carry OpenStreetMap ids, which say nothing
 * about the timetable. Coordinates plus the name from the tile are enough to find the right one:
 * prefer a stop whose name matches, fall back to the closest.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string} [name] - Stop name as shown on the map, if known.
 * @returns {Promise<NearbyStop|null>}
 */
export async function resolveStop(lat, lng, name) {
  const stops = await getNearbyStops(lat, lng, 10);
  if (stops.length === 0) {
    return null;
  }

  if (name) {
    const wanted = normalizeName(name);
    const byName = stops.find((stop) => {
      const candidate = normalizeName(stop.name);
      return candidate === wanted || candidate.includes(wanted) || wanted.includes(candidate);
    });
    if (byName) {
      return byName;
    }
  }

  return stops[0];
}

/**
 * @typedef {Object} Departure
 * @property {string} mode - MOTIS mode, e.g. `SUBWAY`, `TRAM`, `BUS`.
 * @property {string} line - Line as printed on the vehicle, e.g. `U6`.
 * @property {string} headsign - Where the vehicle is heading.
 * @property {string} time - ISO timestamp of the actual departure.
 * @property {string} scheduledTime - ISO timestamp of the planned departure.
 * @property {number} delay - Minutes late, negative when early, 0 when on time or unknown.
 * @property {boolean} realTime - Whether the operator confirmed the time.
 * @property {string|null} color - `#rrggbb` line colour, when the feed carries one.
 */

/**
 * Turns one upstream stop time into the shape the UI renders.
 *
 * @param {import('./transitousClient.js').RawStopTime} stopTime
 * @returns {Departure|null} `null` for entries without a usable departure time.
 */
function normalizeDeparture(stopTime) {
  const place = stopTime.place || {};
  const scheduled = place.scheduledDeparture || place.departure;
  const actual = place.departure || place.scheduledDeparture;

  if (!actual) {
    return null;
  }

  const delayMs = new Date(actual).getTime() - new Date(scheduled).getTime();

  return {
    mode: stopTime.mode || 'UNKNOWN',
    line: stopTime.routeShortName || '',
    headsign: stopTime.headsign || '',
    time: actual,
    scheduledTime: scheduled,
    delay: Number.isFinite(delayMs) ? Math.round(delayMs / 60000) : 0,
    realTime: place.realTime === true,
    color: stopTime.routeColor ? `#${stopTime.routeColor}` : null,
  };
}

/**
 * @typedef {Object} DepartureBoard
 * @property {{id: string, name: string, distance?: number}} stop
 * @property {Departure[]} departures
 */

/**
 * Fetches the next departures of a stop.
 *
 * @param {Object} params
 * @param {string} [params.stopId] - Transitous stop id, when the caller already resolved one.
 * @param {number} [params.lat] - Used with `lng` to resolve the stop when no id is given.
 * @param {number} [params.lng]
 * @param {string} [params.name] - Stop name from the map, improves the resolution.
 * @param {number} [params.limit=8] - How many departures to return.
 * @returns {Promise<DepartureBoard|null>} `null` when no stop could be resolved or the lookup
 * failed.
 */
export async function getDepartures({ stopId, lat, lng, name, limit = 8 }) {
  let stop = stopId ? { id: stopId, name: name || '' } : null;

  if (!stop) {
    if (lat == null || lng == null) {
      return null;
    }
    stop = await resolveStop(lat, lng, name);
    if (!stop) {
      return null;
    }
  }

  const board = await cached(
    `departures:${stop.id}:${limit}`,
    (value) => (value == null ? FAILURE_TTL : DEPARTURES_TTL),
    () => fetchDepartures(stop.id, limit),
  );

  if (board == null) {
    return null;
  }

  return {
    // The upstream name is the authoritative one ("U Unter den Linden (Berlin)"), but a stop
    // resolved by coordinates also knows how far away it is, which the UI shows.
    stop: { ...stop, name: board.stop?.name || stop.name },
    departures: board.stopTimes.map(normalizeDeparture).filter((departure) => departure != null),
  };
}
