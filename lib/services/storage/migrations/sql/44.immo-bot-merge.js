/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Single-database merge: absorb the old scoring backend's shadow `listings` table.
 *
 * The backend used to keep its own copy of every listing plus its enrichment results. From
 * here on Fredy's `listings` row is the single record and the backend writes back over HTTP,
 * so the columns that only existed on the backend side move here:
 * - `commute_minutes` transit time to the destination in minutes.
 * - `risk_analysis` full Gemini risk verdict as JSON (alongside the short `risk_summary`).
 * - `blacklisted` backend-side blacklist flag, 0/1.
 * - `nutzung` intended usage (e.g. Eigennutz vs Kapitalanlage).
 *
 * Score and Bodenrichtwert columns (`investor_score`, `owner_score`, `brw_value`, `cagr`,
 * ...) already live here from earlier scoring migrations and are untouched.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('commute_minutes')) {
    db.exec(`ALTER TABLE listings ADD COLUMN commute_minutes REAL DEFAULT NULL`);
  }
  if (missing('risk_analysis')) {
    db.exec(`ALTER TABLE listings ADD COLUMN risk_analysis TEXT DEFAULT NULL`);
  }
  if (missing('blacklisted')) {
    db.exec(`ALTER TABLE listings ADD COLUMN blacklisted INTEGER DEFAULT 0`);
  }
  if (missing('nutzung')) {
    db.exec(`ALTER TABLE listings ADD COLUMN nutzung TEXT DEFAULT NULL`);
  }
}
