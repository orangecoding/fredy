/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';

/**
 * The public Overpass endpoint place lookups go to by default.
 *
 * A setting for the same reason `motisBaseUrl` is one: it is a free community service that may
 * withdraw its welcome, and an operator who leans on this feature should be able to point at their
 * own instance without a code change.
 * @type {string}
 */
export const DEFAULT_OVERPASS_BASE_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Default ceiling on how many listings one sweep may look up places for.
 *
 * Unlike the reachability query, a place-type answer cannot be shared between listings: the nearest
 * supermarket is a different supermarket for each one. So this is a genuine per-listing request
 * count and it is deliberately a trickle, the same shape as `travelTimeStreetLookupsPerRun`. The
 * requests themselves are small - a few hundred bytes - which is why this is forty rather than
 * fifteen.
 * @type {number}
 */
export const DEFAULT_POI_LOOKUPS_PER_RUN = 40;

/**
 * How long a cached Overpass answer is trusted, in days.
 *
 * Shops open and close, but not weekly, and the cost of being a month out of date is one listing
 * measured to a supermarket that has since become a pharmacy. The cost of a short lifetime is
 * hammering a donated service, which is much worse.
 * @type {number}
 */
export const DEFAULT_POI_CACHE_MAX_AGE_DAYS = 30;

/**
 * Places of interest as travel time targets.
 *
 * Two halves. The first is a cache of OpenStreetMap: which supermarkets, gyms and pharmacies sit in
 * a given ~1.1 km grid cell. It is keyed by cell rather than by listing so a street's worth of
 * listings costs one Overpass query, and it lives in the database rather than in memory because the
 * answer stays true for weeks - an in-process copy would be thrown away by every restart, and the
 * next sweep would then re-ask a free community service for every cell at once.
 *
 * No foreign key on it: it caches the world, not anything in this database, and it has to survive a
 * listing being purged by the retention sweep.
 *
 * The settings seeded below are the operator-facing dials, every one of them editable under
 * Admin -> Routing. The endpoints and thresholds that are not dials live as constants in the
 * modules that use them, the way `breitbandatlasClient.js` keeps its own.
 *
 * The second half is two columns on `listing_travel_times`. A named address is its own answer - the
 * label says where the journey started. A place type is not: the row has to record *which*
 * supermarket was measured, or the detail page can show a number with nothing behind it.
 *
 * - `origin_name` is what to call the place that was found.
 * - `origin_ref` is the category it was found for. `stillValid` needs it: changing a label from
 *   grocery to gym must invalidate the row, and `origin_lat`/`origin_lng` cannot say so, because for
 *   a place type the coordinates are the answer rather than the question.
 *
 * Both are nullable and both are null for every existing row, which is exactly right - those rows
 * were all measured to named addresses.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS poi_places (
      cell_lat   REAL    NOT NULL,
      cell_lng   REAL    NOT NULL,
      category   TEXT    NOT NULL,
      places     TEXT    NOT NULL,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (cell_lat, cell_lng, category)
    )
  `);
  // Aged out rather than capped by row count, so the purge needs to find rows by age alone.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_poi_places_fetched_at ON poi_places (fetched_at)`);

  // Additive, and checked first, following migration 31: `CREATE TABLE IF NOT EXISTS` does nothing
  // to a table that already exists, so an instance that ran an earlier draft of this would
  // otherwise be left without the columns and every insert would fail.
  const travelTimeColumns = db
    .prepare(`PRAGMA table_info(listing_travel_times)`)
    .all()
    .map((column) => column.name);
  for (const column of ['origin_name', 'origin_ref']) {
    if (!travelTimeColumns.includes(column)) {
      db.exec(`ALTER TABLE listing_travel_times ADD COLUMN ${column} TEXT`);
    }
  }

  // Only what an operator can actually reach from the admin area. A row here is a promise that the
  // value is configurable, so the search radius is deliberately absent: how far away a supermarket
  // may be and still count is a statement about what a useful answer looks like, not about load, and
  // an instance that set it to fifty kilometres would have a worse product rather than a tuned one.
  seedSetting(db, 'poiEnabled', true);
  seedSetting(db, 'overpassBaseUrl', DEFAULT_OVERPASS_BASE_URL);
  seedSetting(db, 'poiLookupsPerRun', DEFAULT_POI_LOOKUPS_PER_RUN);
  seedSetting(db, 'poiCacheMaxAgeDays', DEFAULT_POI_CACHE_MAX_AGE_DAYS);
}

/**
 * Insert a global setting, but only when the operator has no value for it yet.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} name
 * @param {any} value
 * @returns {void}
 */
function seedSetting(db, name, value) {
  const exists = db.prepare(`SELECT 1 FROM settings WHERE name = @name AND user_id IS NULL LIMIT 1`).get({ name });
  if (exists) return;
  db.prepare(
    `INSERT INTO settings (id, create_date, name, value, user_id)
     VALUES (@id, @create_date, @name, @value, NULL)`,
  ).run({ id: nanoid(), create_date: Date.now(), name, value: JSON.stringify(value) });
}
