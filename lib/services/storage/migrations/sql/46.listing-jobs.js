/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Cross-job deduplication: one row per flat, many jobs per row.
 *
 * Two jobs with overlapping searches used to store the same flat twice (or three times):
 * every dedup key was scoped to a single job - the exact hash contains the job id, the
 * fingerprint matcher requires equal job ids, and the UNIQUE index sits on (job_id, hash).
 * The `listing_jobs` join table carries the fix: a listing keeps its original `job_id` as
 * the primary job (so every existing JOIN keeps working), and every additional job that
 * finds the same URL is attached here instead of getting its own row.
 *
 * A row is only ever visible through its attached jobs, so deleting a job detaches it
 * first and only deletes rows left with zero jobs.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS listing_jobs
    (
      listing_id  TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
      job_id      TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
      attached_at INTEGER NOT NULL,
      PRIMARY KEY (listing_id, job_id)
    );
    CREATE INDEX IF NOT EXISTS idx_listing_jobs_job ON listing_jobs (job_id);
  `);

  // Pre-existing rows belong to their primary job; without this the join table starts
  // empty and every listing would look jobless to the new read path.
  db.exec(`
    INSERT OR IGNORE INTO listing_jobs (listing_id, job_id, attached_at)
    SELECT id, job_id, COALESCE(created_at, 0) FROM listings WHERE job_id IS NOT NULL
  `);
}
