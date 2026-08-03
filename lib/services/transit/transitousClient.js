/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import https from 'https';
import fetch from 'node-fetch';
import pThrottle from 'p-throttle';
import logger from '../logger.js';
import { selfHostedUserAgent } from '../userAgent.js';

/**
 * Thin client for the Transitous public transport API (https://transitous.org), a community run
 * MOTIS instance fed by the German DELFI and the regional GTFS feeds. It is free and needs no key,
 * which is the reason it is used here - in exchange it is treated like Nominatim: throttled, with a
 * self identifying User-Agent and a long pause after a rate limit answer.
 */
const API_URL = 'https://api.transitous.org/api/v1';

const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
});

// The API asks for fair use rather than naming a number. Two calls per second is well below what a
// single household's map browsing produces, and the service layer's cache absorbs the rest.
const throttle = pThrottle({
  limit: 2,
  interval: 1000,
});

const REQUEST_TIMEOUT = 10000;
const PAUSE_DURATION = 900000; // 15 minutes

let last429 = 0;

/**
 * Runs a GET against the Transitous API.
 *
 * @param {string} path - Path below the API root, starting with a slash.
 * @param {Record<string, string|number>} params - Query parameters, url encoded here.
 * @returns {Promise<unknown|null>} The parsed body, or `null` for every failure - a missing
 * departure board must never take a request down, the UI shows its "unavailable" state instead.
 */
async function get(path, params) {
  if (Date.now() - last429 < PAUSE_DURATION) {
    return null;
  }

  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
  const url = `${API_URL}${path}?${query}`;

  try {
    const response = await fetch(url, {
      agent,
      timeout: REQUEST_TIMEOUT,
      headers: {
        'User-Agent': selfHostedUserAgent,
        Accept: 'application/json',
      },
    });

    if (response.status === 429) {
      logger.warn('Transitous rate limit hit. Pausing transit lookups for 15 minutes.');
      last429 = Date.now();
      return null;
    }

    if (!response.ok) {
      logger.error(`Transitous API error: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    logger.error('Error during Transitous request:', error);
    return null;
  }
}

const throttledGet = throttle(get);

/**
 * @typedef {Object} TransitStop
 * @property {string} id - Transitous stop id, e.g. `de-VBB_de:11000:900100513`.
 * @property {string} name
 * @property {number} lat
 * @property {number} lng
 */

/**
 * Looks up the public transport stops around a coordinate.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<TransitStop[]>} Stops as returned by the API (roughly by relevance), or an
 * empty list when the lookup failed.
 */
export async function fetchNearbyStops(lat, lng) {
  const data = await throttledGet('/reverse-geocode', { place: `${lat},${lng}`, type: 'STOP' });

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .filter((entry) => entry?.type === 'STOP' && entry.id && entry.lat != null && entry.lon != null)
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      lat: Number(entry.lat),
      lng: Number(entry.lon),
    }));
}

/**
 * @typedef {Object} RawStopTime
 * @property {string} [mode] - MOTIS mode, e.g. `SUBWAY`, `TRAM`, `BUS`, `REGIONAL_RAIL`.
 * @property {string} [routeShortName] - The line as printed on the vehicle, e.g. `U6`.
 * @property {string} [headsign] - Where the vehicle is going.
 * @property {string} [routeColor] - Six hex digits without a leading `#`.
 * @property {{scheduledDeparture?: string, departure?: string, realTime?: boolean}} [place]
 */

/**
 * Fetches the next departures of a stop.
 *
 * @param {string} stopId - Transitous stop id.
 * @param {number} limit - How many departures to ask for.
 * @returns {Promise<{stop: {id: string, name: string}|null, stopTimes: RawStopTime[]}|null>} `null`
 * when the lookup failed.
 */
export async function fetchDepartures(stopId, limit) {
  const data = await throttledGet('/stoptimes', { stopId, n: limit });

  if (data == null || !Array.isArray(data.stopTimes)) {
    return null;
  }

  return {
    stop: data.place?.stopId ? { id: data.place.stopId, name: data.place.name } : null,
    stopTimes: data.stopTimes,
  };
}

/**
 * @typedef {Object} RawLeg
 * @property {string} [mode] - MOTIS mode, e.g. `WALK`, `SUBWAY`, `BUS`, `REGIONAL_RAIL`.
 * @property {string} [routeShortName] - The line as printed on the vehicle, when the leg is transit.
 * @property {string} [headsign]
 * @property {number} [duration] - Leg duration in seconds.
 */

/**
 * @typedef {Object} RawItinerary
 * @property {number} duration - Total journey duration in seconds.
 * @property {number} [transfers] - Number of transfers between transit legs.
 * @property {string} [startTime] - ISO departure time.
 * @property {string} [endTime] - ISO arrival time.
 * @property {RawLeg[]} legs
 */

/**
 * Plans a public transport journey between two coordinates. This is explicitly called out by
 * Transitous as a resource-intensive endpoint (unlike stop lookups and departures), so callers must
 * keep usage to one on-demand request at a time - never a batch over many listings - and cache
 * aggressively. See https://transitous.org/api/ before increasing how often this is called.
 *
 * @param {number} fromLat
 * @param {number} fromLng
 * @param {number} toLat
 * @param {number} toLng
 * @returns {Promise<RawItinerary[]|null>} `null` when the lookup failed; an empty array when no
 * connection was found.
 */
export async function fetchPlan(fromLat, fromLng, toLat, toLng) {
  const data = await throttledGet('/plan', {
    fromPlace: `${fromLat},${fromLng}`,
    toPlace: `${toLat},${toLng}`,
    numItineraries: 1,
  });

  if (data == null || !Array.isArray(data.itineraries)) {
    return null;
  }

  return data.itineraries;
}
