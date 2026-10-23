/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Give each job its own address exclusions. Existing searches keep all their criteria and start
 * with an empty list.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db
    .prepare('PRAGMA table_info(jobs)')
    .all()
    .map((column) => column.name);
  if (!columns.includes('excluded_locations')) {
    db.exec("ALTER TABLE jobs ADD COLUMN excluded_locations TEXT NOT NULL DEFAULT '[]'");
  }
}
