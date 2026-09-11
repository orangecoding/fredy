/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

// Migration: the date the portal itself attaches to an advert.
//
// Fredy's own created_at is when this instance first saw the listing, which is a different thing:
// a flat published two weeks ago and only discovered today reads as brand new. Some portals state
// their own date, in the search answer or on the advert's detail page, and a provider that can
// read one sets publishedAt on the listing it hands over; this column is where that lands. The
// listing list orders by it, falling back to created_at where it is missing, so a provider that
// states nothing leaves the column empty and its listings read exactly as they did before.

export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN published_at INTEGER;
  `);
}
