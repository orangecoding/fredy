/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * GREIX-based Kapitalzuwachs.
 *
 * Scoring moves from Bodenrichtwert (land value) to GREIX house-price indices (built
 * real estate): each listing is matched to one of the 13 GREIX Berlin regions by
 * point-in-polygon and scored on that region's 2000-2025 CAGR. New columns:
 * - `greix_region` the matched GREIX region (CSV column name, e.g. `Berlin (Mitte)`).
 * - `greix_cagr` the region's 2000-2025 CAGR as a decimal, driving the growth points.
 *
 * The legacy BRW columns (`brw_value`, `brw_old`, `cagr`, `bezirk`) are left frozen in
 * place - never written again, never read by scoring or the UI.
 *
 * Scores are reset to 0 so the hourly local enrichment cron re-scores every priced
 * listing with GREIX figures (it only selects scoreless rows, draining 20/job/run).
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('greix_region')) {
    db.exec(`ALTER TABLE listings ADD COLUMN greix_region TEXT DEFAULT NULL`);
  }
  if (missing('greix_cagr')) {
    db.exec(`ALTER TABLE listings ADD COLUMN greix_cagr REAL DEFAULT NULL`);
  }

  db.exec(`UPDATE listings SET investor_score = 0, owner_score = 0`);
}
