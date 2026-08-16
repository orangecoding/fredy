/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * How far a job is willing to travel, and what to do about a listing that is further.
 *
 * On the job rather than on the saved address, because it is a search criterion and every other one
 * already lives here: the blacklist, the price and size limits, the drawn area. Two searches can
 * reasonably disagree about the same office - twenty minutes for a flat in the city, fifty for a
 * house in the country - and a number stored next to the address could not tell them apart.
 *
 * The address keeps what belongs to the address: how you travel there and when. Those decide what
 * the sweeper computes and what it costs (a public transport address is answered by one region-wide
 * query, a driving one by a routing per listing), and the stored journey is one row per
 * `listing_id + label`, so there is exactly one mode per address to be had. A job may say how far is
 * too far; it may not say how you get there.
 *
 * Its own column rather than a key inside `spec_filter`: that filter reads price, size and rooms and
 * deliberately runs before the detail fetch, the geocode and the insert, while this one can only run
 * at the very end, once a travel time exists. Two filters with opposite positions in the pipeline
 * should not share a blob.
 *
 * Shape, as JSON:
 *
 * ```json
 * { "action": "notify", "limits": { "Work": 35, "School": 20 } }
 * ```
 *
 * `limits` is keyed by address label, which is what `listing_travel_times` is keyed by too. An
 * address the user left blank is simply absent, and a job with no limits at all is stored as NULL,
 * so nothing about an existing installation changes: every job starts without one.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db
    .prepare(`PRAGMA table_info(jobs)`)
    .all()
    .map((column) => column.name);
  if (!columns.includes('commute_filter')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN commute_filter TEXT`);
  }
}
