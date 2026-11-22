/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * How many result pages a job reads per run.
 *
 * `jobs.paging` holds the page count and the pause between two pages, as JSON:
 *
 * ```json
 * { "pages": 3, "waitSeconds": 30, "jitterSeconds": 30 }
 * ```
 *
 * NULL means one page, which is what every job read before this column existed, so no existing job
 * changes. See `lib/utils/paging.js`.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db
    .prepare(`PRAGMA table_info(jobs)`)
    .all()
    .map((column) => column.name);
  if (!columns.includes('paging')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN paging TEXT`);
  }
}
