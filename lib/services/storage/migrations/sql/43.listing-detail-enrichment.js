/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * On-demand detail enrichment ("enrich on click").
 *
 * Provider detail pages are no longer fetched for every new listing at scrape time; they are
 * fetched once, when a listing is opened for the first time. These columns track that:
 * - `details_fetched` marks listings whose exposé has been pulled (or was attempted for a
 *   provider that offers no detail fetch, so the UI stops offering a retry for it).
 * - `details_fetched_at` records when, as a unix timestamp in milliseconds.
 * - `image_files` holds the gallery downloaded from the exposé as a JSON array of paths
 *   relative to the images directory, e.g. `["<listingId>/00.jpg", ...]`. The remote
 *   `image_url` cover is intentionally left untouched: notifications still send it.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('details_fetched')) {
    db.exec(`ALTER TABLE listings ADD COLUMN details_fetched INTEGER DEFAULT 0`);
  }
  if (missing('details_fetched_at')) {
    db.exec(`ALTER TABLE listings ADD COLUMN details_fetched_at INTEGER DEFAULT NULL`);
  }
  if (missing('image_files')) {
    db.exec(`ALTER TABLE listings ADD COLUMN image_files TEXT DEFAULT NULL`);
  }
}
