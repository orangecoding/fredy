/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Fredy scoring columns: investor score, owner score, asset risk, BRW, CAGR, and bezirk.
 *
 * These are written by the local enrichment and read by the UI to display
 * score chips in the listings table and a scoring card in the listing detail view.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('investor_score')) {
    db.exec(`ALTER TABLE listings ADD COLUMN investor_score REAL DEFAULT 0`);
  }
  if (missing('owner_score')) {
    db.exec(`ALTER TABLE listings ADD COLUMN owner_score REAL DEFAULT 0`);
  }
  if (missing('asset_risk_score')) {
    db.exec(`ALTER TABLE listings ADD COLUMN asset_risk_score REAL DEFAULT 0`);
  }
  if (missing('brw_value')) {
    db.exec(`ALTER TABLE listings ADD COLUMN brw_value REAL DEFAULT 0`);
  }
  if (missing('brw_old')) {
    db.exec(`ALTER TABLE listings ADD COLUMN brw_old REAL DEFAULT 0`);
  }
  if (missing('cagr')) {
    db.exec(`ALTER TABLE listings ADD COLUMN cagr REAL DEFAULT 0`);
  }
  if (missing('bezirk')) {
    db.exec(`ALTER TABLE listings ADD COLUMN bezirk TEXT DEFAULT ''`);
  }
  if (missing('risk_summary')) {
    db.exec(`ALTER TABLE listings ADD COLUMN risk_summary TEXT DEFAULT ''`);
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_investor_score ON listings(investor_score)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_owner_score ON listings(owner_score)`);
}
