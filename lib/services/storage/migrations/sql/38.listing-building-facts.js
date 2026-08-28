/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The year a building was built and its energy efficiency class, both read off the detail page.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('build_year')) {
    db.exec(`ALTER TABLE listings ADD COLUMN build_year INTEGER`);
  }
  if (missing('energy_class')) {
    db.exec(`ALTER TABLE listings ADD COLUMN energy_class TEXT`);
  }
}
