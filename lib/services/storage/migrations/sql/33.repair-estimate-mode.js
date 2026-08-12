/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Add `listing_travel_times.estimate_mode` on instances that never got it.
 *
 * `estimate_mode` was added to migration 31 *after* that migration had already shipped and run.
 * The runner records a migration by name and skips it forever afterwards - a changed checksum only
 * updates the recorded checksum, it does not re-run anything - so editing an applied migration is a
 * no-op for every instance that had already applied it. Those instances end up with the column
 * missing, and every travel-time write fails with:
 *
 *   SqliteError: table listing_travel_times has no column named estimate_mode
 *
 * which surfaces as "Could not compute travel times for the new listings" on each pipeline run and
 * silently leaves the listing without commute data.
 *
 * A fresh instance already has the column from 31, so the guard makes this a no-op there. The
 * lesson the comment in 31 was reaching for holds in general: a schema change belongs in a new
 * migration, never in one that may already have run.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const tableExists = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'listing_travel_times' LIMIT 1`)
    .get();
  if (!tableExists) return;

  const columns = db
    .prepare(`PRAGMA table_info(listing_travel_times)`)
    .all()
    .map((column) => column.name);

  if (!columns.includes('estimate_mode')) {
    db.exec(`ALTER TABLE listing_travel_times ADD COLUMN estimate_mode TEXT`);
  }
}
