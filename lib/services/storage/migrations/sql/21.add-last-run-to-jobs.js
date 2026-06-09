/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Migration: add `last_run_at` to the `jobs` table.
 *
 * Stores the epoch-ms timestamp at which a job was last triggered. Used by the
 * dashboard "last search" KPI so the value survives restarts and reflects the
 * actual jobs the requesting user can see (own, shared, or all for admins),
 * replacing the previous in-memory `settings.lastRun` value.
 *
 * NULL means the job has not yet been triggered since this column was added.
 */
export function up(db) {
  db.exec(`
    ALTER TABLE jobs ADD COLUMN last_run_at INTEGER
  `);
}
