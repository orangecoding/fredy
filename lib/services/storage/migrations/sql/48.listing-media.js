/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The pictures of a listing: the first one as bytes, every further one as a url.
 *
 * Until now the browser loaded `listings.image_url` straight from the portal's CDN, so the picture
 * vanished the day the portal took the advert down - which is exactly the day somebody wants to
 * look at it again. The first picture is therefore kept as a BLOB, scaled down and re-encoded as
 * WebP (a few dozen kilobytes), for the same reasons `44.listing-attachments.js` gives for keeping
 * uploads in the database: the `/db` volume is the one thing users persist, backups carry it, and
 * `ON DELETE CASCADE` disposes of it on every path a listing can leave by.
 *
 * The rest of the gallery stays a list of urls. Twenty pictures as bytes would be a megabyte per
 * listing; as urls they are a few kilobytes of very repetitive text, so they are stored deflated
 * (roughly a quarter of the JSON).
 *
 * Its own table rather than columns on `listings`, because the overview and the detail reads select
 * `l.*` and would otherwise carry every BLOB along. One row per listing, keyed on it:
 *
 * - `gallery`: deflated JSON of `ListingImage[]`, without the picture `preview` holds.
 * - `preview_mime`: what `preview` is, sniffed from its bytes.
 * - `preview_failed_at`: when the last download failed, so a picture that is gone is not asked
 *   for again on every page view.
 * - `preview`: the bytes. Deliberately the last column: SQLite reads a row's columns in order and
 *   spills a large value onto overflow pages, so everything in front of it stays cheap to read.
 *
 * Not `WITHOUT ROWID`, which SQLite advises against for rows this size.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS listing_media (
      listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
      gallery BLOB,
      preview_mime TEXT,
      preview_failed_at INTEGER,
      created_at INTEGER NOT NULL,
      preview BLOB
    )
  `);
}
