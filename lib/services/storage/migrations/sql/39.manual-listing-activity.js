/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Remember that a listing's availability was decided by a human.
 *
 * The alive-checker is a guess made from an HTTP response, and it is wrong often enough to matter:
 * a portal that answers 403 to anything without a browser, a listing that briefly 404s during an
 * edit, a flat that is still advertised on a second portal Fredy deduped away. Once that guess has
 * marked a curated listing as gone, nothing in Fredy ever brings it back.
 *
 * This column is what makes the manual correction stick - every automated writer of `is_active`
 * can be told to leave a flagged row alone, the same way `address_is_manual` protects a hand-picked
 * address.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (!columns.some((column) => column.name === 'activity_is_manual')) {
    db.exec(`ALTER TABLE listings ADD COLUMN activity_is_manual INTEGER NOT NULL DEFAULT 0`);
  }
}
