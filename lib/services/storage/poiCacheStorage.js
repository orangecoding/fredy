/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import SqliteConnection from './SqliteConnection.js';
import { toJson, fromJson } from '../../utils.js';

/**
 * The places Overpass has already been asked about, kept between restarts.
 *
 * A table rather than the in-memory cache the transit lookups share, and the two differ in every
 * way that decides it. A reachability answer is megabytes and is a picture of a timetable, so it is
 * worth little by tomorrow and holding it in the process is right. An Overpass answer is a couple of
 * kilobytes and stays true for weeks - shops do not move - so an in-memory copy would be discarded
 * by a restart long before it expired, and the first sweep after a deploy would ask a free community
 * service for every cell the instance has ever seen, all at once.
 *
 * Keyed by grid cell rather than by listing. Coordinates are rounded to two decimals, about 1.1 km,
 * so a street's worth of listings shares one row. That is the whole saving: the query is per
 * neighbourhood, and only the routing that follows is per listing.
 */

/**
 * How coarse the cache key is.
 *
 * Two decimals is roughly 1.1 km of latitude. Coarse enough that a city block collapses to one row,
 * fine enough that the search radius around the cell centre still covers every listing in it
 * without ballooning.
 * @type {number}
 */
export const CELL_PRECISION = 2;

/**
 * The cell a coordinate falls in.
 *
 * @param {number} value
 * @returns {number}
 */
export function toCell(value) {
  return Number(Number(value).toFixed(CELL_PRECISION));
}

/**
 * Half the diagonal of a cell, in metres, rounded up.
 *
 * A query is anchored at the cell centre but has to answer for listings anywhere in the cell, so
 * the radius it asks for is the caller's radius plus this. Without it a listing in the corner of a
 * cell would be missing the places nearest to it, which is precisely the answer it wanted.
 * @type {number}
 */
export const CELL_RADIUS_METERS = 900;

/**
 * The cached places for one cell and category, if they are still young enough.
 *
 * @param {Object} params
 * @param {number} params.cellLat
 * @param {number} params.cellLng
 * @param {string} params.category
 * @param {number} params.freshAfter - Epoch ms; rows fetched before this are treated as absent.
 * @returns {Array<{name: string, lat: number, lng: number}>|null} `null` for a miss, which includes
 * an expired row - the caller then refetches and overwrites it.
 */
export const getCachedPlaces = ({ cellLat, cellLng, category, freshAfter }) => {
  const row = SqliteConnection.query(
    `SELECT places FROM poi_places
      WHERE cell_lat = @cellLat AND cell_lng = @cellLng AND category = @category
        AND fetched_at > @freshAfter`,
    { cellLat, cellLng, category, freshAfter },
  )[0];
  if (row == null) {
    return null;
  }
  const places = fromJson(row.places, null);
  return Array.isArray(places) ? places : null;
};

/**
 * Store what Overpass answered for one cell and category.
 *
 * An empty array is stored like any other answer. "There is no pharmacy in this village" is a fact
 * worth keeping - re-asking every sweep would be the one case that never stops costing anything.
 * Only a *failed* lookup is not stored, and the caller enforces that by never calling this with one.
 *
 * @param {Object} params
 * @param {number} params.cellLat
 * @param {number} params.cellLng
 * @param {string} params.category
 * @param {Array<{name: string, lat: number, lng: number}>} params.places
 * @param {number} [params.fetchedAt=Date.now()]
 * @returns {void}
 */
export const saveCachedPlaces = ({ cellLat, cellLng, category, places, fetchedAt = Date.now() }) => {
  SqliteConnection.execute(
    `INSERT INTO poi_places (cell_lat, cell_lng, category, places, fetched_at)
     VALUES (@cellLat, @cellLng, @category, @places, @fetchedAt)
     ON CONFLICT(cell_lat, cell_lng, category) DO UPDATE SET
       places = excluded.places,
       fetched_at = excluded.fetched_at`,
    { cellLat, cellLng, category, places: toJson(places ?? []), fetchedAt },
  );
};

/**
 * Drop everything fetched before a cutoff.
 *
 * Aged out rather than capped by row count: an instance searching two cities should keep both, and
 * the size of this table is bounded by how much of the map its jobs actually cover.
 *
 * @param {number} olderThan - Epoch ms.
 * @returns {number} Rows removed.
 */
export const purgeCachedPlaces = (olderThan) => {
  const result = SqliteConnection.execute(`DELETE FROM poi_places WHERE fetched_at <= @olderThan`, { olderThan });
  return result?.changes ?? 0;
};
