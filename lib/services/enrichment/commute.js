/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Commute time to the fixed destination, Potsdamer Platz.
 *
 * Behavior-identical port of the backend's `_rough_estimate` (isochrones.py). The backend
 * preferred a live ORS matrix lookup, but the configured key was always the mock placeholder,
 * so every production call fell through to this haversine formula - the numbers Fredy ever
 * stored came from here, and so do the new ones.
 *
 * Deliberately kept rough per the project decision: no Motis/ORS wiring, no per-user
 * destination. The destination is fixed because the historical commute_minutes it must stay
 * comparable with were all measured against Potsdamer Platz.
 *
 * @param {number|null|undefined} latitude Listing latitude in degrees.
 * @param {number|null|undefined} longitude Listing longitude in degrees.
 * @returns {number|null} Commute minutes, or null when the position is unknown.
 */
const DEST_LAT = 52.5244;
const DEST_LON = 13.3884;

export function roughCommuteMinutes(latitude, longitude) {
  if (latitude == null || longitude == null) return null;
  const dlat = DEST_LAT - latitude;
  const dlon = (DEST_LON - longitude) * Math.cos((latitude * Math.PI) / 180);
  const km = Math.sqrt(dlat * dlat + dlon * dlon) * 111.32;
  return (km / 25) * 60;
}
