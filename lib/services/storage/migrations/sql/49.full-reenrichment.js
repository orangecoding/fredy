/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Full re-enrichment, including inactive listings.
 *
 * The catch-up selector no longer filters on `is_active` (scoring is local and free,
 * and an off-market listing keeps its scores for history and price-drop comparisons),
 * so this migration resets both scores to queue every priced listing - active or not -
 * for a full rescore on the next cron run.
 *
 * The retry counters are reset alongside the scores: rows stamped within the last 24h
 * or that already burned their two attempts would otherwise stay excluded from the
 * selection and keep stale scores.
 *
 * Score and GREIX columns are never dropped - the legacy BRW columns stay frozen.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(
    `UPDATE listings
     SET investor_score = 0,
         owner_score = 0,
         enrichment_requests = 0,
         enrichment_requested_at = NULL`,
  );
}
