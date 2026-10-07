/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Add isochronen_miete column for Fredy cashflow/buy-rent score explanations.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('isochronen_miete')) {
    db.exec(`ALTER TABLE listings ADD COLUMN isochronen_miete REAL DEFAULT 0`);
  }
}
