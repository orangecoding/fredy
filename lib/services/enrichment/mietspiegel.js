/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Berlin Mietspiegel cold-rent estimate.
 *
 * Behavior-identical port of the backend's `_mietspiegel_estimate` (isochrones.py): a coarse
 * lookup table mapping living space to EUR/m². The backend used it as the fallback whenever
 * the ORS isochrone call failed (which, with the mock API key, was always) and as the seed
 * value before the commute-aware figure arrived.
 *
 * @param {number|null|undefined} area Living space in m².
 * @returns {number} Estimated cold rent in EUR/m², 6.00 when the area is unknown.
 */
export function mietspiegelEstimate(area) {
  if (area == null) return 6.0;
  if (area <= 25) return 8.5;
  if (area <= 40) return 8.0;
  if (area <= 60) return 7.5;
  if (area <= 90) return 7.0;
  if (area <= 120) return 6.5;
  return 6.0;
}
