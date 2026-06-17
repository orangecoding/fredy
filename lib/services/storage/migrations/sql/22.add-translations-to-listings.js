/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Adds a `translations` JSON column to the listings table.
 * Stores translated descriptions keyed by language code, e.g. { "en": "...", "de": "..." }.
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.exec(`ALTER TABLE listings ADD COLUMN translations TEXT;`);
}
