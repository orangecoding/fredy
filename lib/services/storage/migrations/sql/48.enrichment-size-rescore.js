/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Living-space fix rescore.
 *
 * `enrichListing` read the living space from `listing.area`, but stored rows carry it
 * as `size` - so every listing scored with the "area unknown" rent (6.0 EUR/m²) and
 * dead cashflow/buy-rent legs (growth points only). The reader now falls back to
 * `size`, and this migration resets both scores so the uncapped enrichment cron
 * re-scores every priced listing with all three legs live.
 *
 * The retry counters are reset alongside the scores: a row that already burned its two
 * attempts (e.g. a -1/-1 "geocoder found nothing" row stamped at 0/0) would otherwise
 * stay excluded from the catch-up selection and keep its growth-only zeros.
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
