/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { distanceMeters } from './mapUtils.js';
import { decodePolyline, MOTIS_POLYLINE_PRECISION } from './polyline.js';

export const ROUTE_SOURCE_ID = 'route';
export const ROUTE_CASING_LAYER_ID = 'route-casing';
export const ROUTE_LINE_LAYER_ID = 'route';
export const ROUTE_LABEL_LAYER_ID = 'route-distance';

/** Same blue as the listing marker, so the line reads as belonging to it. */
const ROUTE_COLOR = '#3FB1CE';

/**
 * A distance in the units people use.
 *
 * @param {number} meters
 * @returns {string}
 */
function formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/**
 * The point halfway along a line, measured by length rather than by vertex count.
 *
 * Taking the middle vertex would be wrong twice over: on a straight line there is no middle vertex
 * at all, and on a real route the vertices bunch up around corners, so the middle one can sit well
 * before the halfway mark.
 *
 * @param {Array<[number, number]>} coordinates
 * @returns {[number, number]}
 */
function midpointOf(coordinates) {
  if (coordinates.length < 2) {
    return coordinates[0];
  }

  const lengths = [];
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const dx = coordinates[i][0] - coordinates[i - 1][0];
    const dy = coordinates[i][1] - coordinates[i - 1][1];
    const segment = Math.hypot(dx, dy);
    lengths.push(segment);
    total += segment;
  }

  let travelled = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (travelled + lengths[i] >= total / 2) {
      const ratio = lengths[i] === 0 ? 0 : (total / 2 - travelled) / lengths[i];
      const [x1, y1] = coordinates[i];
      const [x2, y2] = coordinates[i + 1];
      return [x1 + (x2 - x1) * ratio, y1 + (y2 - y1) * ratio];
    }
    travelled += lengths[i];
  }

  return coordinates[coordinates.length - 1];
}

/**
 * The drawable geometry of one address in one mode.
 *
 * A transit journey is several lines, not one - the walk, the U6, the change, the bus - so it comes
 * back as a list. Everything else is a single line, and the straight line is what is left when a
 * mode has no route stored yet.
 *
 * @param {{latitude: number, longitude: number}} listing
 * @param {{label?: string, coords: {lat: number, lng: number}}} home
 * @param {Object|undefined} travelTime - The stored entry for this address, if there is one.
 * @param {'straight'|'car'|'bike'|'walk'|'transit'} routeMode
 * @returns {{lines: Array<{coordinates: Array<[number, number]>, color: string|null}>, label: string}}
 */
function routeFor(listing, home, travelTime, routeMode) {
  const straight = () => {
    const meters = distanceMeters(listing.latitude, listing.longitude, home.coords.lat, home.coords.lng);
    return {
      lines: [
        {
          coordinates: [
            [listing.longitude, listing.latitude],
            [home.coords.lng, home.coords.lat],
          ],
          color: null,
          walking: true,
        },
      ],
      label: formatDistance(meters),
    };
  };

  if (routeMode === 'straight' || travelTime == null) {
    return straight();
  }

  if (routeMode === 'transit') {
    const legs = Array.isArray(travelTime.transit?.legs) ? travelTime.transit.legs : [];
    const lines = legs
      .map((leg) => ({
        coordinates: decodePolyline(leg.geometry, MOTIS_POLYLINE_PRECISION),
        // The line's own colour where the feed carries one, so an S-Bahn reads as an S-Bahn. The
        // walking legs deliberately get none and fall back to the route colour.
        color: leg.mode === 'WALK' ? null : (leg.color ?? null),
        walking: leg.mode === 'WALK',
      }))
      .filter((line) => line.coordinates.length > 1);

    if (lines.length === 0) {
      return straight();
    }
    // Drawn from the origin outwards here, unlike the straight line, because that is the direction
    // the journey is described in and reversing several legs would only scramble their order.
    return { lines, label: `${travelTime.transit.minutes} min` };
  }

  const mode = travelTime[routeMode];
  const coordinates = mode?.geometry ? decodePolyline(mode.geometry, MOTIS_POLYLINE_PRECISION) : [];
  if (coordinates.length < 2) {
    return straight();
  }

  const parts = [mode.distanceMeters != null ? formatDistance(mode.distanceMeters) : null, `${mode.minutes} min`];
  // MOTIS draws from the origin to the destination; the rest of this file draws from the listing
  // outwards, so the label lands in the same place either way once reversed.
  return {
    lines: [{ coordinates: [...coordinates].reverse(), color: null }],
    label: parts.filter(Boolean).join(' \u00b7 '),
  };
}

/**
 * The places a listing's place types actually resolved to, in the shape an address has.
 *
 * A named address carries its own coordinates and is the same point for every listing. A place type
 * has none: "a supermarket" is a question, and the supermarket it turns out to be is a property of
 * this listing rather than of the setting. So the point to draw comes from the listing's own travel
 * times, which is where the sweep recorded it.
 *
 * @param {Array<Object>|null|undefined} travelTimes
 * @returns {Array<{label: string, address: string, coords: {lat: number, lng: number}}>}
 */
export function placeTargets(travelTimes) {
  return (Array.isArray(travelTimes) ? travelTimes : [])
    .filter((entry) => entry?.place != null && Number.isFinite(entry.place.lat))
    .map((entry) => ({
      label: entry.label,
      address: entry.place.name || '',
      coords: { lat: entry.place.lat, lng: entry.place.lng },
    }));
}

/**
 * The route from a listing to each of the user's reference addresses, with the distance written
 * along it.
 *
 * Where a driving route has been worked out for this listing, that is what gets drawn - a line
 * through the buildings in between says very little about a city with a river in it. Until then it
 * falls back to the straight line, which needs no routing service and has always been what this
 * drew.
 *
 * @param {{latitude: number, longitude: number}} listing
 * @param {Array<{label?: string, coords: {lat: number, lng: number}}>} homeAddresses
 * @param {Array<Object>} [travelTimes] - Stored travel times of this listing, keyed by address label.
 * @returns {{type: 'FeatureCollection', features: Array<Object>}}
 */
export function buildRouteData(listing, homeAddresses, travelTimes = [], routeMode = 'straight') {
  const homes = Array.isArray(homeAddresses) ? homeAddresses : [];
  const byLabel = new Map((Array.isArray(travelTimes) ? travelTimes : []).map((entry) => [entry.label, entry]));

  return {
    type: 'FeatureCollection',
    features: homes.flatMap((home) => {
      const { lines, label } = routeFor(listing, home, byLabel.get(home.label), routeMode);
      const labelPrefix = home.label ? `${home.label}: ` : '';
      // Halfway along the whole journey rather than halfway along one leg, so the label lands on
      // the middle of what is drawn even when it is drawn in five pieces.
      const midpoint = midpointOf(lines.flatMap((line) => line.coordinates));

      return [
        ...lines.map((line) => ({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: line.coordinates },
          properties: { ...(line.color ? { color: line.color } : {}), walking: line.walking === true },
        })),
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: midpoint },
          properties: { distance: `${labelPrefix}${label}` },
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

  // A dark casing under everything. Transit legs are drawn in their operator's colour, and a yellow
  // bus line on top of a yellow motorway is invisible without one - which is exactly what happened.
  if (map.getLayer(ROUTE_CASING_LAYER_ID) == null) {
    map.addLayer({
      id: ROUTE_CASING_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#1b1b1b', 'line-width': 8, 'line-opacity': 0.55 },
      filter: ['==', '$type', 'LineString'],
    });
  }

  if (map.getLayer(ROUTE_LINE_LAYER_ID) == null) {
    map.addLayer({
      id: ROUTE_LINE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        // Per-feature colour where a transit leg carried one, the listing blue everywhere else.
        'line-color': ['coalesce', ['get', 'color'], ROUTE_COLOR],
        'line-width': 5,
        // Dashed for the parts you walk, solid for the parts you ride. Reads as a journey rather
        // than as one undifferentiated squiggle.
        'line-dasharray': ['case', ['get', 'walking'], ['literal', [2, 1.5]], ['literal', [1, 0]]],
      },
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

  for (const layerId of [ROUTE_LABEL_LAYER_ID, ROUTE_LINE_LAYER_ID, ROUTE_CASING_LAYER_ID]) {
    if (map.getLayer(layerId) != null) map.removeLayer(layerId);
  }
  if (map.getSource(ROUTE_SOURCE_ID) != null) map.removeSource(ROUTE_SOURCE_ID);
}
