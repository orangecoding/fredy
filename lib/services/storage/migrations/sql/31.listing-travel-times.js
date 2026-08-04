/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';

/**
 * Default ceiling on how many listings one travel-time sweep may work through.
 *
 * Not a request count: a sweep asks the routing service once per address, whatever the number of
 * listings. This bounds how much local work one run does, not how much outbound traffic it causes.
 * @type {number}
 */
export const DEFAULT_TRAVEL_TIME_LIMIT_PER_RUN = 500;

/**
 * Default age at which a stored travel time is looked up again.
 * @type {number}
 */
export const DEFAULT_TRAVEL_TIME_MAX_AGE_DAYS = 30;

/**
 * Default ceiling for the reachability query, in minutes.
 *
 * Doubles as the size dial for the single most expensive request Fredy makes: a big city answers
 * for about nine megabytes at ninety minutes and about two at thirty. Ninety covers any commute
 * somebody would seriously consider; an operator on a small connection can lower it.
 * @type {number}
 */
export const DEFAULT_TRAVEL_TIME_MAX_MINUTES = 90;

/**
 * Default ceiling on street routings per sweep.
 *
 * Two things draw on it: an address the user asked to be measured by car or on foot, and a place
 * public transport does not reach. Everything else is answered from one region-wide reachability
 * lookup per address, which costs nothing per listing. A small trickle means an instance works
 * through its backlog over a few days rather than in one burst.
 * @type {number}
 */
export const DEFAULT_TRAVEL_TIME_STREET_LOOKUPS_PER_RUN = 15;

/**
 * The public MOTIS endpoint travel times are requested from by default.
 *
 * Without a version: MOTIS versions its endpoints separately, and Fredy uses two of them.
 * @type {string}
 */
export const DEFAULT_MOTIS_BASE_URL = 'https://api.transitous.org/api';

/**
 * How long it really takes to get from the user's addresses to a listing.
 *
 * A table rather than another key in `listings.distances`, for three reasons. The distances blob is
 * written as a whole by the straight-line calculation and nulled whenever an address is corrected,
 * so a travel time living inside it would be destroyed by a computation that knows nothing about
 * it. `distances IS NULL` is also the backfill signal for that calculation, and it must keep
 * meaning only that. And a row per address is what lets one address be re-requested while the
 * others are left alone - the coordinates and the reference departure are stored per row precisely
 * so the sweeper can tell which pairs actually changed.
 *
 * `ON DELETE CASCADE` follows the price-history precedent: the retention purge, the job deletion
 * and the demo cleanup all dispose of these rows without knowing this feature exists.
 *
 * `travel_times_at` drives the due query and cannot share a column with any other probe - two
 * schedules writing one clock means whichever runs more often starves the other. `travel_times_failures`
 * bounds the damage of a listing that simply cannot be routed to.
 *
 * `is_estimate` records which of the two ways the row was produced. The scheduled sweep asks the
 * routing service once per address how long it takes to reach every stop in the region, and works
 * out the last stretch to the front door from the straight-line distance - that is what the
 * Transitous maintainers recommended, because the alternative is a street routing per listing.
 * Opening a listing's detail page asks for the real journey, which also fills in car, bike and walk.
 * Both are honest; only one is exact, and the UI says which.
 *
 * Nothing is backfilled. `travel_times_at IS NULL` is exactly the "never looked at" signal, so
 * existing listings are picked up by the first sweep on their own.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS listing_travel_times (
      listing_id          TEXT    NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      label               TEXT    NOT NULL,
      origin_lat          REAL    NOT NULL,
      origin_lng          REAL    NOT NULL,
      transit_minutes     INTEGER,
      transit_transfers   INTEGER,
      car_minutes         INTEGER,
      car_distance_meters INTEGER,
      car_geometry        TEXT,
      bike_minutes        INTEGER,
      bike_geometry       TEXT,
      walk_minutes        INTEGER,
      walk_geometry       TEXT,
      transit_legs        TEXT,
      via_stops           TEXT,
      estimate_mode       TEXT,
      is_estimate         INTEGER NOT NULL DEFAULT 1,
      reference_time      INTEGER NOT NULL,
      computed_at         INTEGER NOT NULL,
      PRIMARY KEY (listing_id, label)
    )
  `);
  // `CREATE TABLE IF NOT EXISTS` above does nothing to a table that already exists, so an instance
  // that ran an earlier draft of this migration would be left without the column and every insert
  // would fail. Adding it separately is what makes the migration repair such a table instead of
  // quietly skipping it, and it has to happen before the indexes, which name columns of their own.
  // Existing rows default to 1: everything written before this column existed came from the sweep,
  // which produces estimates.
  const travelTimeColumns = db
    .prepare(`PRAGMA table_info(listing_travel_times)`)
    .all()
    .map((column) => column.name);
  if (!travelTimeColumns.includes('is_estimate')) {
    db.exec(`ALTER TABLE listing_travel_times ADD COLUMN is_estimate INTEGER NOT NULL DEFAULT 1`);
  }
  // Same repair for the drawable parts. They arrive in the routing answer Fredy already pays for,
  // so the only cost of keeping them is the bytes, and they are what lets the detail map draw the
  // way actually taken rather than a line through the buildings.
  for (const column of ['bike_geometry', 'walk_geometry', 'transit_legs', 'via_stops', 'estimate_mode']) {
    if (!travelTimeColumns.includes(column)) {
      db.exec(`ALTER TABLE listing_travel_times ADD COLUMN ${column} TEXT`);
    }
  }

  if (travelTimeColumns.includes('transit_minutes')) {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_travel_times_transit ON listing_travel_times (transit_minutes)`);
  }
  if (travelTimeColumns.includes('car_minutes')) {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_travel_times_car ON listing_travel_times (car_minutes)`);
  }

  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (!columns.some((column) => column.name === 'travel_times_at')) {
    db.exec(`ALTER TABLE listings ADD COLUMN travel_times_at INTEGER`);
  }
  if (!columns.some((column) => column.name === 'travel_times_failures')) {
    db.exec(`ALTER TABLE listings ADD COLUMN travel_times_failures INTEGER NOT NULL DEFAULT 0`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_travel_times_at ON listings (travel_times_at)`);

  seedSetting(db, 'travelTimeLimitPerRun', DEFAULT_TRAVEL_TIME_LIMIT_PER_RUN);
  seedSetting(db, 'travelTimeMaxAgeDays', DEFAULT_TRAVEL_TIME_MAX_AGE_DAYS);
  seedSetting(db, 'travelTimeMaxMinutes', DEFAULT_TRAVEL_TIME_MAX_MINUTES);
  seedSetting(db, 'travelTimeStreetLookupsPerRun', DEFAULT_TRAVEL_TIME_STREET_LOOKUPS_PER_RUN);
  seedSetting(db, 'motisBaseUrl', DEFAULT_MOTIS_BASE_URL);
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
