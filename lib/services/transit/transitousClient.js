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

/**
 * Thin client for the Transitous public transport API (https://transitous.org), a community run
 * MOTIS instance fed by the German DELFI and the regional GTFS feeds. It is free and needs no key,
 * which is the reason it is used here - in exchange it is treated like Nominatim: throttled, with a
 * self identifying User-Agent and a long pause after a rate limit answer.
 */
const DEFAULT_API_URL = 'https://api.transitous.org/api';

/**
 * Resolves the MOTIS endpoint to talk to.
 *
 * Transitous asks to be contacted before a project sends it routing traffic, and reserves the right
 * to stop serving any consumer. An instance that outgrows that welcome needs somewhere else to
 * point, so the endpoint is a setting; it is read per request rather than captured at import time
 * so changing it does not need a restart. A broken settings read falls back to the public instance
 * instead of taking transit lookups down with it.
 *
 * The version is part of the path, not of this base, because MOTIS versions its endpoints
 * separately - journey planning is v1 while the reachability query is v6. A configured value that
 * still carries a version suffix is trimmed rather than rejected, so an older setting keeps working.
 *
 * @returns {Promise<string>} API root without a version and without a trailing slash.
 */
async function resolveApiUrl() {
  try {
    const configured = (await getSettings())?.motisBaseUrl;
    if (typeof configured === 'string' && configured.trim().length > 0) {
      return configured
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/v\d+$/, '');
    }
  } catch (error) {
    logger.error('Could not read motisBaseUrl, falling back to the public Transitous endpoint:', error);
  }
  return DEFAULT_API_URL;
}

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
  const url = `${await resolveApiUrl()}${path}?${query}`;

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
 * Whether the client is currently sitting out a rate limit.
 *
 * While it is, every request returns `null` without touching the network. A batch job needs to know
 * that, otherwise it spends its whole per-run budget producing nothing - the same reason the
 * geocoding sweep checks `isPaused()` before each address.
 *
 * @returns {boolean}
 */
export function isTransitPaused() {
  return Date.now() - last429 < PAUSE_DURATION;
}

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
  const data = await throttledGet('/v1/reverse-geocode', { place: `${lat},${lng}`, type: 'STOP' });

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
  const data = await throttledGet('/v1/stoptimes', { stopId, n: limit });

  if (data == null || !Array.isArray(data.stopTimes)) {
    return null;
  }

  return {
    stop: data.place?.stopId ? { id: data.place.stopId, name: data.place.name } : null,
    stopTimes: data.stopTimes,
  };
}

/**
 * Direct modes asked for on every journey query.
 *
 * All three come back in the same response as the transit options, so asking for them costs nothing
 * beyond a slightly larger body: one request answers "how long by car, bike, foot and train".
 */
const DIRECT_MODES = 'CAR,WALK,BIKE';

/**
 * Ceiling for a direct connection, in seconds.
 *
 * Walking is the reason for the limit: without it MOTIS happily returns a nine hour hike. Two hours
 * is past anything a person would consider walkable, so a missing walk entry means "further than
 * that", not "unknown".
 */
const MAX_DIRECT_TIME = 7200;

/**
 * @typedef {Object} PlanLeg
 * @property {string} mode - MOTIS mode, e.g. `CAR`, `WALK`, `METRO`, `BUS`.
 * @property {number} duration - Seconds.
 * @property {number} [distance] - Metres along the actual path, for street legs.
 * @property {{points: string, precision: number, length: number}} [legGeometry] - Encoded polyline.
 * @property {string} [routeShortName]
 * @property {string} [routeColor]
 * @property {{name?: string}} [from]
 * @property {{name?: string}} [to]
 *
 * @typedef {Object} PlanItinerary
 * @property {number} duration - Seconds.
 * @property {number} [transfers]
 * @property {string} [startTime]
 * @property {string} [endTime]
 * @property {PlanLeg[]} legs
 *
 * @typedef {Object} PlanResponse
 * @property {PlanItinerary[]} [direct] - One entry per direct mode that was routable.
 * @property {PlanItinerary[]} [itineraries] - Public transport options.
 */

/**
 * Plans a journey between two coordinates.
 *
 * One request answers for every mode at once: `direct` holds the car, bike and walk options,
 * `itineraries` the public transport ones.
 *
 * This is the expensive endpoint. Every direct mode it answers for is a street routing, and the
 * Transitous maintainers asked us not to run those in bulk because they add up to a lot of CPU on a
 * service run by volunteers. So it is used only where a person is waiting for the answer - one
 * listing, opened by hand - while everything that runs on a schedule goes through
 * {@link fetchOneToAll} instead.
 *
 * @param {Object} params
 * @param {number} params.fromLat
 * @param {number} params.fromLng
 * @param {number} params.toLat
 * @param {number} params.toLng
 * @param {string} params.time - ISO timestamp of the intended departure.
 * @param {number} [params.numItineraries=3] - How many transit options to ask for.
 * @returns {Promise<PlanResponse|null>} `null` for every failure, so a missing journey never takes a
 * request down.
 */
export async function fetchPlan({ fromLat, fromLng, toLat, toLng, time, numItineraries = 3 }) {
  const data = await throttledGet('/v1/plan', {
    fromPlace: `${fromLat},${fromLng}`,
    toPlace: `${toLat},${toLng}`,
    directModes: DIRECT_MODES,
    maxDirectTime: MAX_DIRECT_TIME,
    numItineraries,
    time,
    arriveBy: false,
  });

  if (data == null || typeof data !== 'object') {
    return null;
  }

  // Either list may legitimately be absent (no transit coverage, nothing routable by road), but a
  // body carrying neither is not an answer we can use.
  if (!Array.isArray(data.direct) && !Array.isArray(data.itineraries)) {
    return null;
  }

  return { direct: data.direct ?? [], itineraries: data.itineraries ?? [] };
}

/**
 * One street route between two places, in a single mode.
 *
 * `transitModes` is deliberately sent empty: without it MOTIS also searches the timetable, and for
 * the cases this exists for - a place public transport does not serve, or a user who only cares
 * about driving - that search is work asked for and thrown away. One street routing, nothing else.
 *
 * @param {Object} params
 * @param {'CAR'|'BIKE'|'WALK'} params.mode
 * @param {number} params.fromLat
 * @param {number} params.fromLng
 * @param {number} params.toLat
 * @param {number} params.toLng
 * @returns {Promise<{answered: boolean, route: {minutes: number, distanceMeters: number|null, geometry: string|null}|null}>}
 * `answered` is false only when the request itself failed. An answer with no route in it means
 * there is genuinely no connection - the two must not be confused, because one is worth retrying
 * forever and the other is worth remembering.
 */
export async function fetchStreetRoute({ mode, fromLat, fromLng, toLat, toLng }) {
  const data = await throttledGet('/v1/plan', {
    fromPlace: `${fromLat},${fromLng}`,
    toPlace: `${toLat},${toLng}`,
    directModes: mode,
    transitModes: '',
    maxDirectTime: MAX_DIRECT_TIME,
    arriveBy: false,
  });

  if (data == null || typeof data !== 'object' || !Array.isArray(data.direct)) {
    return { answered: false, route: null };
  }

  const itinerary = data.direct.find((entry) => entry?.legs?.[0]?.mode === mode);
  if (itinerary == null || !Number.isFinite(itinerary.duration)) {
    return { answered: true, route: null };
  }

  const leg = itinerary.legs[0];
  return {
    answered: true,
    route: {
      minutes: Math.round(itinerary.duration / 60),
      distanceMeters: Number.isFinite(leg.distance) ? Math.round(leg.distance) : null,
      geometry: typeof leg.legGeometry?.points === 'string' ? leg.legGeometry.points : null,
    },
  };
}

/**
 * @typedef {Object} ReachableStop
 * @property {string} name
 * @property {number} lat
 * @property {number} lng
 * @property {number} minutes - Door to platform, including the walk to the first stop.
 * @property {number} transfers
 */

/**
 * Every public transport stop reachable from a place, with how long it takes to get there.
 *
 * One request per origin, answering for a whole city at once, instead of one request per
 * destination. This is what the Transitous maintainers recommended when we described what Fredy
 * wanted to do, and it is the difference between a few requests a day and a few hundred: the walk
 * from the last stop to the front door is then estimated locally rather than asked for, which is
 * exactly the street routing they asked us not to do in bulk.
 *
 * Only the three numbers that matter are kept. The raw answer carries a full record per stop -
 * names, modes, timezones, arrival timestamps - and for a large city that is several megabytes that
 * nothing downstream reads.
 *
 * @param {Object} params
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {string} params.time - ISO timestamp of the intended departure.
 * @param {number} params.maxTravelTime - Ceiling in minutes. Drives the size of the answer.
 * @param {number} [params.maxPreTransitTime=900] - Seconds of walking allowed to reach the first stop.
 * @returns {Promise<ReachableStop[]|null>} `null` when the lookup failed.
 */
export async function fetchOneToAll({ lat, lng, time, maxTravelTime, maxPreTransitTime = 900 }) {
  const data = await throttledGet('/v6/one-to-all', {
    one: `${lat},${lng}`,
    time,
    maxTravelTime,
    maxPreTransitTime,
    arriveBy: false,
    transitModes: 'TRANSIT',
    preTransitModes: 'WALK',
  });

  if (data == null || !Array.isArray(data.all)) {
    return null;
  }

  /** @type {Map<string, ReachableStop>} */
  const best = new Map();
  for (const entry of data.all) {
    const stopLat = Number(entry?.place?.lat);
    const stopLng = Number(entry?.place?.lon);
    const minutes = Number(entry?.duration);
    if (!Number.isFinite(stopLat) || !Number.isFinite(stopLng) || !Number.isFinite(minutes)) {
      continue;
    }
    // Several platforms of one station arrive as separate entries at the same coordinate. Only the
    // quickest way onto that spot is of any use, and collapsing them here roughly halves what is
    // carried around afterwards.
    const key = `${stopLat.toFixed(5)},${stopLng.toFixed(5)}`;
    const existing = best.get(key);
    if (existing == null || minutes < existing.minutes) {
      best.set(key, {
        // Kept so the UI can say which stop an estimate came from. It roughly doubles what is held
        // in memory, and being able to answer "via where?" is worth that.
        name: entry.place.name ?? '',
        lat: stopLat,
        lng: stopLng,
        minutes,
        // `k` counts connections, not changes: a direct ride is k=1, and k=0 means the stop was
        // reached on foot without boarding anything. Reporting it raw claimed one change too many
        // on every single estimate.
        transfers: Number.isFinite(entry.k) ? Math.max(0, Number(entry.k) - 1) : 0,
      });
    }
  }

  return [...best.values()];
}

/**
 * How a coordinate is spelled in the one-to-many endpoints.
 *
 * Semicolon rather than comma, because `many` is itself a comma separated list of these. Getting it
 * wrong is not a silent failure - the API answers `"48.137,11.575 is not a valid geo coordinate"` -
 * but it is worth one function so both callers cannot drift.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {string}
 */
function place(lat, lng) {
  return `${lat};${lng}`;
}

/**
 * @param {Array<{lat: number, lng: number}>} destinations
 * @returns {string}
 */
function places(destinations) {
  return destinations.map((destination) => place(destination.lat, destination.lng)).join(',');
}

/**
 * @typedef {Object} StreetDuration
 * @property {number|null} seconds - `null` when the destination could not be reached in `max`.
 * @property {number|null} meters - Only present when the request asked for distances.
 */

/**
 * How long it takes to reach each of several places on foot, by bike or by car.
 *
 * The whole point of this endpoint is that it is one request for many destinations. Asking "which of
 * these eight supermarkets is nearest by road" the obvious way would be eight routings, which is
 * exactly the per-listing traffic the Transitous maintainers asked us not to generate. This is one
 * request of a few hundred bytes.
 *
 * The answer is positional: entry `i` is about `destinations[i]`. An unreachable destination comes
 * back as an empty object rather than being omitted, so the positions stay aligned.
 *
 * @param {Object} params
 * @param {'WALK'|'BIKE'|'CAR'} params.mode
 * @param {number} params.fromLat
 * @param {number} params.fromLng
 * @param {Array<{lat: number, lng: number}>} params.destinations
 * @param {number} params.maxSeconds - Ceiling on the travel time. Capped server side.
 * @returns {Promise<StreetDuration[]|null>} `null` when the lookup failed.
 */
export async function fetchOneToMany({ mode, fromLat, fromLng, destinations, maxSeconds }) {
  if (!Array.isArray(destinations) || destinations.length === 0) {
    return null;
  }

  const data = await throttledGet('/v1/one-to-many', {
    one: place(fromLat, fromLng),
    many: places(destinations),
    mode,
    max: Math.round(maxSeconds),
    // Metres of tolerance when snapping a coordinate onto the street network. An OSM node for a
    // supermarket sits on the building, not on the road, so a tight value would silently fail to
    // match exactly the places this feature is about.
    maxMatchingDistance: 250,
    withDistance: true,
    // Required, not optional, despite reading like a refinement: without it the endpoint answers
    // 400 "missing parameter". Fredy always asks in the leaving-now direction.
    arriveBy: false,
  });

  if (!Array.isArray(data)) {
    return null;
  }
  return data.map((entry) => ({
    seconds: Number.isFinite(entry?.duration) ? Number(entry.duration) : null,
    meters: Number.isFinite(entry?.distance) ? Number(entry.distance) : null,
  }));
}

/**
 * @typedef {Object} IntermodalDuration
 * @property {StreetDuration} street - The direct walk, for comparison. Often the better answer.
 * @property {{seconds: number, transfers: number}|null} transit - The quickest public transport
 * option, or `null` when there is none within the ceiling.
 */

/**
 * How long it takes to reach each of several places by public transport, and on foot for comparison.
 *
 * This is what makes place types affordable. The obvious way to answer "how long to the nearest
 * supermarket by public transport" is the reachability query - ask once which stops are reachable
 * from the listing, then walk in from the nearest one - and that answer is two to nine megabytes,
 * per listing, because the origin is a different listing every time. This endpoint answers the same
 * question for eight destinations in about 250 bytes.
 *
 * `directMode=WALK` is not an afterthought: the same response then carries how long it would simply
 * take to walk there, which for a supermarket four streets away is usually the quicker answer and
 * always the more useful one. Getting it costs nothing extra.
 *
 * Marked experimental upstream. `getPlaceMatrix` degrades to per-destination routing if a MOTIS
 * deployment does not serve it.
 *
 * @param {Object} params
 * @param {number} params.fromLat
 * @param {number} params.fromLng
 * @param {Array<{lat: number, lng: number}>} params.destinations
 * @param {string} params.time - ISO timestamp of the intended departure.
 * @param {number} params.maxTravelTime - Ceiling in minutes.
 * @param {number} params.maxDirectSeconds - Ceiling on the walking comparison.
 * @returns {Promise<IntermodalDuration[]|null>} `null` when the lookup failed.
 */
export async function fetchOneToManyIntermodal({
  fromLat,
  fromLng,
  destinations,
  time,
  maxTravelTime,
  maxDirectSeconds,
}) {
  if (!Array.isArray(destinations) || destinations.length === 0) {
    return null;
  }

  const data = await throttledGet('/experimental/one-to-many-intermodal', {
    one: place(fromLat, fromLng),
    many: places(destinations),
    time,
    maxTravelTime: Math.round(maxTravelTime),
    transitModes: 'TRANSIT',
    preTransitModes: 'WALK',
    postTransitModes: 'WALK',
    directMode: 'WALK',
    maxDirectTime: Math.round(maxDirectSeconds),
    withDistance: true,
    arriveBy: false,
  });

  const street = Array.isArray(data?.street_durations) ? data.street_durations : null;
  const transit = Array.isArray(data?.transit_durations) ? data.transit_durations : null;
  if (street == null && transit == null) {
    return null;
  }

  return destinations.map((_destination, index) => {
    const direct = street?.[index] ?? {};
    // A Pareto set - fastest, fewest transfers, and so on. The fastest is what a travel time means
    // here, and the transfer count comes along with whichever that is.
    const options = Array.isArray(transit?.[index]) ? transit[index] : [];
    const best = options
      .filter((option) => Number.isFinite(option?.duration))
      .sort((a, b) => a.duration - b.duration)[0];

    return {
      street: {
        seconds: Number.isFinite(direct?.duration) ? Number(direct.duration) : null,
        meters: Number.isFinite(direct?.distance) ? Number(direct.distance) : null,
      },
      transit:
        best == null
          ? null
          : {
              seconds: Number(best.duration),
              // Already a transfer count, unlike one-to-all's `k`, which counts connections and
              // needs one subtracted from it.
              transfers: Number.isFinite(best.transfers) ? Math.max(0, Number(best.transfers)) : 0,
            },
    };
  });
}
