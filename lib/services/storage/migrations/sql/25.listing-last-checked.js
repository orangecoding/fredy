/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Remember when a listing was last probed for being online.
 *
 * The nightly alive-checker used to re-probe every active listing on every run: one outbound HTTP
 * request per listing, at four in parallel. On an instance with a few thousand listings that is a
 * continuous stream of traffic at the same handful of hosts for the better part of an hour - a
 * good way to have the instance's address blocked, which then also breaks scraping.
 *
 * With this column the checker can re-probe only what it has not looked at recently, and cap how
 * much it does per run. NULL means "never checked", which sorts first so nothing is starved.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (!columns.some((column) => column.name === 'last_checked_at')) {
    db.exec(`ALTER TABLE listings ADD COLUMN last_checked_at INTEGER`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_last_checked ON listings (last_checked_at)`);
}
