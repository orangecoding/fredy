/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Thin wrapper around the OpenRouteService directions API.
 *
 * Endpoint: GET https://api.openrouteservice.org/v2/directions/{profile}
 * Coordinates are passed as longitude,latitude (GeoJSON order).
 *
 * @module orsClient
 */

const BASE_URL = 'https://api.openrouteservice.org/v2/directions';

export const PROFILES = /** @type {const} */ ({
  WALKING: 'foot-walking',
  CYCLING: 'cycling-regular',
  DRIVING: 'driving-car',
});

/**
 * Fetch directions between two points for a given transport profile.
 *
 * @param {number} startLng - Start longitude (GeoJSON order: lon first)
 * @param {number} startLat - Start latitude
 * @param {number} endLng - End longitude
 * @param {number} endLat - End latitude
 * @param {string} profile - ORS profile: 'foot-walking' | 'cycling-regular' | 'driving-car'
 * @param {string} apiKey - OpenRouteService API key
 * @returns {Promise<{ duration: number, distance: number }>} duration in seconds, distance in meters
 * @throws {Error} On rate limit, API error, or unexpected response shape
 */
export async function getDirections(startLng, startLat, endLng, endLat, profile, apiKey) {
  const url = `${BASE_URL}/${profile}?start=${startLng},${startLat}&end=${endLng},${endLat}&api_key=${apiKey}`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json, application/geo+json' },
  });

  if (response.status === 429) {
    throw new Error('ORS rate limit exceeded. Please try again later.');
  }

  if (!response.ok) {
    throw new Error(`ORS API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const summary = data?.features?.[0]?.properties?.summary;

  if (!summary || summary.duration == null) {
    throw new Error('ORS returned an unexpected response shape.');
  }

  return { duration: summary.duration, distance: summary.distance };
}

/**
 * Fetch directions for all three profiles in parallel.
 *
 * Uses Promise.allSettled so a failure for one profile does not block the others.
 * Failed profiles are returned as null.
 *
 * @param {number} startLng @param {number} startLat
 * @param {number} endLng   @param {number} endLat
 * @param {string} apiKey
 * @returns {Promise<Record<string, { duration: number, distance: number } | null>>}
 */
export async function getAllDirections(startLng, startLat, endLng, endLat, apiKey) {
  const profileList = Object.values(PROFILES);
  const results = await Promise.allSettled(
    profileList.map((profile) => getDirections(startLng, startLat, endLng, endLat, profile, apiKey)),
  );
  return Object.fromEntries(
    profileList.map((profile, i) => [profile, results[i].status === 'fulfilled' ? results[i].value : null]),
  );
}
