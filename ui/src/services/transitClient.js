/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { xhrGet } from './xhr.js';

/**
 * Client for Fredy's public transport endpoints. The backend proxies the upstream timetable API,
 * so nothing here talks to a third party directly.
 */

/**
 * @typedef {Object} NearbyStop
 * @property {string} id
 * @property {string} name
 * @property {number} lat
 * @property {number} lng
 * @property {number} distance - Straight-line metres from the queried coordinate.
 */

/**
 * Loads the public transport stops closest to a coordinate.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} [limit=3]
 * @returns {Promise<NearbyStop[]>}
 */
export async function getNearbyStops(lat, lng, limit = 3) {
  const query = new URLSearchParams({ lat: String(lat), lng: String(lng), limit: String(limit) });
  const response = await xhrGet(`/api/transit/stops/nearby?${query}`);
  return response.json?.stops ?? [];
}

/**
 * @typedef {Object} Departure
 * @property {string} mode
 * @property {string} line
 * @property {string} headsign
 * @property {string} time - ISO timestamp of the actual departure.
 * @property {string} scheduledTime
 * @property {number} delay - Minutes late, negative when early.
 * @property {boolean} realTime
 * @property {string|null} color
 */

/**
 * Loads the next departures of a stop. Either `stopId` or `lat`/`lng` must be given; passing the
 * stop `name` alongside coordinates helps the backend pick the right stop.
 *
 * @param {{stopId?: string, lat?: number, lng?: number, name?: string, limit?: number}} params
 * @returns {Promise<{stop: {id: string, name: string, distance?: number}, departures: Departure[]}>}
 */
export async function getDepartures({ stopId, lat, lng, name, limit = 8 }) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (stopId) query.set('stopId', stopId);
  if (lat != null) query.set('lat', String(lat));
  if (lng != null) query.set('lng', String(lng));
  if (name) query.set('name', name);

  const response = await xhrGet(`/api/transit/departures?${query}`);
  return response.json;
}
