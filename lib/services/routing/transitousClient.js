/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Thin wrapper around the Transitous / MOTIS v2 routing API.
 *
 * Endpoint: GET https://api.transitous.org/api/v1/plan
 * No API key required. Coordinates are passed as latitude,longitude (MOTIS order).
 *
 * Modes returned:
 *   WALK, BIKE, CAR  → resolved from `direct[0]`
 *   TRANSIT          → resolved from `itineraries[0]` (best public-transport option)
 *
 * @module transitousClient
 */

const BASE_URL = 'https://api.transitous.org/api/v1/plan';

/** User-Agent required by Transitous usage policy. */
const USER_AGENT = 'fredy/1.0 (https://github.com/orangecoding/fredy)';

export const MODES = /** @type {const} */ ({
  WALKING: 'WALK',
  CYCLING: 'BIKE',
  DRIVING: 'CAR',
  TRANSIT: 'TRANSIT',
});

/**
 * Build the query URL for a direct (non-transit) mode.
 * @param {number} startLat @param {number} startLng
 * @param {number} endLat   @param {number} endLng
 * @param {string} mode     One of WALK | BIKE | CAR
 * @returns {string}
 */
function directUrl(startLat, startLng, endLat, endLng, mode) {
  return `${BASE_URL}?fromPlace=${startLat},${startLng}&toPlace=${endLat},${endLng}&numItineraries=1&directModes=${mode}`;
}

/**
 * Build the query URL for public-transport routing.
 * @param {number} startLat @param {number} startLng
 * @param {number} endLat   @param {number} endLng
 * @returns {string}
 */
function transitUrl(startLat, startLng, endLat, endLng) {
  return `${BASE_URL}?fromPlace=${startLat},${startLng}&toPlace=${endLat},${endLng}&numItineraries=1&transportModes=TRANSIT,WALK`;
}

/**
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function apiFetch(url) {
  return fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
}

/**
 * Fetch directions for a direct transport mode (WALK, BIKE, CAR).
 *
 * @param {number} startLat
 * @param {number} startLng
 * @param {number} endLat
 * @param {number} endLng
 * @param {string} mode - WALK | BIKE | CAR
 * @returns {Promise<{ duration: number, distance: number }>} duration in seconds, distance in meters
 * @throws {Error} On rate limit, API error, or unexpected response shape
 */
export async function getDirectRoute(startLat, startLng, endLat, endLng, mode) {
  const response = await apiFetch(directUrl(startLat, startLng, endLat, endLng, mode));

  if (response.status === 429) throw new Error('Transitous rate limit exceeded. Please try again later.');
  if (!response.ok) throw new Error(`Transitous API error: ${response.status} ${response.statusText}`);

  const data = await response.json();
  const itinerary = data?.direct?.[0];

  if (!itinerary || itinerary.duration == null) throw new Error('Transitous returned an unexpected response shape.');

  const leg = itinerary.legs?.[0];
  return { duration: itinerary.duration, distance: leg?.distance ?? 0 };
}

/**
 * Fetch the best public-transport itinerary.
 *
 * @param {number} startLat
 * @param {number} startLng
 * @param {number} endLat
 * @param {number} endLng
 * @returns {Promise<{ duration: number, transfers: number }>} duration in seconds, number of transfers
 * @throws {Error} On rate limit, API error, unexpected response shape, or no transit available
 */
export async function getTransitRoute(startLat, startLng, endLat, endLng) {
  const response = await apiFetch(transitUrl(startLat, startLng, endLat, endLng));

  if (response.status === 429) throw new Error('Transitous rate limit exceeded. Please try again later.');
  if (!response.ok) throw new Error(`Transitous API error: ${response.status} ${response.statusText}`);

  const data = await response.json();
  const itinerary = data?.itineraries?.[0];

  if (!itinerary || itinerary.duration == null) throw new Error('No transit connection found.');

  return { duration: itinerary.duration, transfers: itinerary.transfers ?? 0 };
}

/**
 * Fetch all four transport modes in parallel.
 *
 * Uses Promise.allSettled so a failure for one mode does not block the others.
 * Failed modes are returned as null.
 *
 * @param {number} startLat
 * @param {number} startLng
 * @param {number} endLat
 * @param {number} endLng
 * @returns {Promise<Record<string, { duration: number, distance?: number, transfers?: number } | null>>}
 */
export async function getAllRoutes(startLat, startLng, endLat, endLng) {
  const [walking, cycling, driving, transit] = await Promise.allSettled([
    getDirectRoute(startLat, startLng, endLat, endLng, MODES.WALKING),
    getDirectRoute(startLat, startLng, endLat, endLng, MODES.CYCLING),
    getDirectRoute(startLat, startLng, endLat, endLng, MODES.DRIVING),
    getTransitRoute(startLat, startLng, endLat, endLng),
  ]);

  return {
    [MODES.WALKING]: walking.status === 'fulfilled' ? walking.value : null,
    [MODES.CYCLING]: cycling.status === 'fulfilled' ? cycling.value : null,
    [MODES.DRIVING]: driving.status === 'fulfilled' ? driving.value : null,
    [MODES.TRANSIT]: transit.status === 'fulfilled' ? transit.value : null,
  };
}
