/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { distanceMeters } from './mapUtils.js';

export const ROUTE_SOURCE_ID = 'route';
export const ROUTE_LINE_LAYER_ID = 'route';
export const ROUTE_LABEL_LAYER_ID = 'route-distance';

/** Same blue as the listing marker, so the line reads as belonging to it. */
const ROUTE_COLOR = '#3FB1CE';

/**
 * The straight lines from a listing to each of the user's reference addresses, with the distance
 * written at the midpoint.
 *
 * As-the-crow-flies on purpose: it answers "how far out is this?" without pretending to know a
 * route, and it needs no routing service.
 *
 * @param {{latitude: number, longitude: number}} listing
 * @param {Array<{label?: string, coords: {lat: number, lng: number}}>} homeAddresses
 * @returns {{type: 'FeatureCollection', features: Array<Object>}}
 */
export function buildRouteData(listing, homeAddresses) {
  const homes = Array.isArray(homeAddresses) ? homeAddresses : [];

  return {
    type: 'FeatureCollection',
    features: homes.flatMap((home) => {
      const distance = distanceMeters(listing.latitude, listing.longitude, home.coords.lat, home.coords.lng);
      const midpoint = [(listing.longitude + home.coords.lng) / 2, (listing.latitude + home.coords.lat) / 2];
      const labelPrefix = home.label ? `${home.label}: ` : '';

      return [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [listing.longitude, listing.latitude],
              [home.coords.lng, home.coords.lat],
            ],
          },
          properties: {},
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: midpoint },
          properties: { distance: `${labelPrefix}${Math.round(distance)} m` },
        },
      ];
    }),
  };
}

/**
 * Put the route line and its distance labels on the map, or take them off again.
 *
 * Idempotent, because a style change (switching to satellite, say) drops every custom source and
 * layer and this has to be replayable on each `styledata` without piling up duplicates.
 *
 * @param {Object} map - A MapLibre map.
 * @param {{type: string, features: Array<Object>}} data - From `buildRouteData`.
 * @returns {void}
 */
export function applyRouteLayers(map, data) {
  if (map == null) return;

  if (data == null || data.features.length === 0) {
    removeRouteLayers(map);
    return;
  }

  const existing = map.getSource(ROUTE_SOURCE_ID);
  if (existing != null) {
    existing.setData(data);
  } else {
    map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data });
  }

  if (map.getLayer(ROUTE_LINE_LAYER_ID) == null) {
    map.addLayer({
      id: ROUTE_LINE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ROUTE_COLOR, 'line-width': 4, 'line-dasharray': [2, 1] },
      filter: ['==', '$type', 'LineString'],
    });
  }

  if (map.getLayer(ROUTE_LABEL_LAYER_ID) == null) {
    map.addLayer({
      id: ROUTE_LABEL_LAYER_ID,
      type: 'symbol',
      source: ROUTE_SOURCE_ID,
      layout: {
        'text-field': ['get', 'distance'],
        'text-size': 14,
        'text-offset': [0, -1],
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': ROUTE_COLOR, 'text-halo-width': 2 },
      filter: ['==', '$type', 'Point'],
    });
  }
}

/**
 * Drop the route layers and their source, leaving nothing behind for a later re-add to trip over.
 *
 * @param {Object} map - A MapLibre map.
 * @returns {void}
 */
export function removeRouteLayers(map) {
  if (map == null) return;

  for (const layerId of [ROUTE_LABEL_LAYER_ID, ROUTE_LINE_LAYER_ID]) {
    if (map.getLayer(layerId) != null) map.removeLayer(layerId);
  }
  if (map.getSource(ROUTE_SOURCE_ID) != null) map.removeSource(ROUTE_SOURCE_ID);
}
