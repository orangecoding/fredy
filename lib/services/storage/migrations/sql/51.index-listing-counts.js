/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * An index the per-job listing count can be answered from alone.
 *
 * The job list, the dashboard, and every single-job read count a job's visible listings with
 * `job_id = ? AND is_active = 1 AND manually_deleted = 0`. The indexes on `(job_id, hash)` and
 * `(job_id, price)` find the job's rows but not the two flags, so every listing of the job cost a
 * lookup of its row. With all three columns in one index the count never touches the table.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_job_visible ON listings (job_id, is_active, manually_deleted)`);
}
