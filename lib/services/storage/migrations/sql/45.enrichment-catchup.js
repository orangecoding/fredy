/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Enrichment catch-up bookkeeping.
 *
 * A listing can miss enrichment without anything being broken: the webhook throw is logged
 * and forgotten, a restart kills in-flight backend tasks, a 401 deploy window drops a whole
 * burst. The hourly catch-up cron re-sends such rows through the normal webhook path, and
 * these columns bound it:
 * - `enrichment_requested_at` records the last catch-up send as a unix timestamp.
 * - `enrichment_requests` counts catch-up sends. Retries create duplicate backend rows
 *   (the backend aims at convergence by URL, not at exactly-once), so the count caps how
 *   many copies of one listing may exist: two sends, then the row waits for a human.
 *
 * Rows the pipeline just found carry NULL/0 and are picked up on the next run; rows sent
 * within the last day are skipped so a slow backend is not hammered hourly.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('enrichment_requested_at')) {
    db.exec(`ALTER TABLE listings ADD COLUMN enrichment_requested_at INTEGER DEFAULT NULL`);
  }
  if (missing('enrichment_requests')) {
    db.exec(`ALTER TABLE listings ADD COLUMN enrichment_requests INTEGER DEFAULT 0`);
  }
}
