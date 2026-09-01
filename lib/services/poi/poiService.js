/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { distanceMeters } from '../listings/distanceCalculator.js';
import { getSettings } from '../storage/settingsStorage.js';
import { CELL_RADIUS_METERS, getCachedPlaces, saveCachedPlaces, toCell } from '../storage/poiCacheStorage.js';
import { findPlaces, isOverpassPaused } from './overpassClient.js';
import { isPlaceCategory } from './categories.js';
import logger from '../logger.js';
import { DEFAULT_POI_CACHE_MAX_AGE_DAYS } from '../storage/migrations/sql/40.travel-time-places.js';

/**
 * Which real places a listing should be measured against for a given category.
 *
 * The expensive half of a place type, and the half that is shared. Overpass is asked once per grid
 * cell per category and the answer is kept in the database for weeks, so a street's worth of
 * listings costs one query. The routing that follows is per listing, because the nearest supermarket
 * to one front door is not the nearest to the next.
 */

/**
 * How many candidates are handed on for routing.
 *
 * The routing endpoints take many destinations in one request, so this is not a request count - it
 * is how long the `many` list is allowed to get. Eight is comfortably more than enough for "which of
 * these is closest by road" while staying well under the server's own `onetomany_max_many`, and the
 * ninth-nearest supermarket as the crow flies is never the nearest one to walk to.
 * @type {number}
 */
export const MAX_CANDIDATES = 8;

/**
 * How far from a listing a place may be and still count, in metres.
 *
 * A constant rather than a setting, deliberately. It is not a load dial - the Overpass answer is
 * cached per cell either way - it is a statement about what a useful answer looks like. Generous,
 * because "the nearest supermarket is 6 km away" is true and worth knowing for a rural listing,
 * while a tighter radius would report nothing there at all. An instance that raised it to fifty
 * kilometres would not be tuned, it would be answering a question nobody asked.
 * @type {number}
 */
export const SEARCH_RADIUS_METERS = 8000;

/**
 * In-flight lookups, so two listings in one cell asked about at the same time make one request.
 *
 * The only piece of this cache that lives in the process. The stored answers belong in the database
 * - they outlive a restart by weeks - but a promise cannot be written to a table, and collapsing
 * concurrent misses is exactly what stops a sweep and a pipeline run duplicating each other's work.
 * @type {Map<string, Promise<Array<{name: string, lat: number, lng: number}>|null>>}
 */
const inFlight = new Map();

/**
 * @param {number} value
 * @param {number} fallback
 * @returns {number}
 */
function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * The tunables one lookup works from.
 *
 * @returns {Promise<{freshAfter: number}>}
 */
async function resolveLookupSettings(now) {
  const settings = await getSettings();
  const maxAgeDays = positiveInt(settings?.poiCacheMaxAgeDays, DEFAULT_POI_CACHE_MAX_AGE_DAYS);
  return { freshAfter: now - maxAgeDays * 24 * 60 * 60 * 1000 };
}

/**
 * Every place of one category near a cell, from the cache or from Overpass.
 *
 * @param {Object} params
 * @param {number} params.cellLat
 * @param {number} params.cellLng
 * @param {string} params.category
 * @param {number} params.radiusMeters
 * @param {number} params.freshAfter
 * @param {number} params.now
 * @returns {Promise<Array<{name: string, lat: number, lng: number}>|null>} `null` only when the
 * lookup failed. An empty array means there is genuinely nothing of that kind nearby, and it is
 * cached like any other answer - re-asking every sweep would be the one case that never stops
 * costing anything.
 */
async function placesForCell({ cellLat, cellLng, category, radiusMeters, freshAfter, now }) {
  const cached = getCachedPlaces({ cellLat, cellLng, category, freshAfter });
  if (cached != null) {
    return cached;
  }

  const key = `${cellLat},${cellLng}/${category}`;
  const running = inFlight.get(key);
  if (running) {
    return running;
  }

  const promise = (async () => {
    // Anchored at the cell centre, so the radius has to cover a listing in its far corner as well.
    const places = await findPlaces({
      category,
      lat: cellLat,
      lng: cellLng,
      radiusMeters: radiusMeters + CELL_RADIUS_METERS,
    });
    // A failed lookup is never written. Caching it would turn a rate limit into "there are no
    // pharmacies in this town" for the next month.
    if (places == null) {
      return null;
    }
    saveCachedPlaces({ cellLat, cellLng, category, places, fetchedAt: now });
    return places;
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * The candidate places one listing should be measured against.
 *
 * Sorted by straight line and capped at {@link MAX_CANDIDATES}. Straight line is the *shortlisting*
 * rule, not the answer: which of these is actually nearest is decided by the routing that follows,
 * because a river or a railway line can put the closest supermarket on the wrong side of both.
 *
 * @param {Object} params
 * @param {number} params.lat - The listing.
 * @param {number} params.lng
 * @param {string} params.category
 * @param {number} [params.now=Date.now()]
 * @returns {Promise<Array<{name: string, lat: number, lng: number, meters: number}>|null>} `null`
 * when the lookup failed, which the caller must not record as "nothing nearby".
 */
export async function findNearbyPlaces({ lat, lng, category, now = Date.now() }) {
  if (!isPlaceCategory(category) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (isOverpassPaused()) {
    return null;
  }

  try {
    const { freshAfter } = await resolveLookupSettings(now);
    const radiusMeters = SEARCH_RADIUS_METERS;
    const places = await placesForCell({
      cellLat: toCell(lat),
      cellLng: toCell(lng),
      category,
      radiusMeters,
      freshAfter,
      now,
    });
    if (places == null) {
      return null;
    }

    return (
      places
        .map((place) => ({ ...place, meters: Math.round(distanceMeters(place.lat, place.lng, lat, lng)) }))
        // Measured from the listing rather than from the cell centre, which is the point of keeping
        // the cache coarse and the shortlist exact.
        .filter((place) => place.meters <= radiusMeters)
        .sort((a, b) => a.meters - b.meters)
        .slice(0, MAX_CANDIDATES)
    );
  } catch (error) {
    logger.warn(`Could not look up nearby ${category} places`, error);
    return null;
  }
}
