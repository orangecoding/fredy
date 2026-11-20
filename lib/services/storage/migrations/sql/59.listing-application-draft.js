/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * LLM-generated application draft per listing.
 *
 * Two metadata columns rather than a computed view, following the benchmark/median pattern of
 * migration 41: the draft states what the model wrote when Fredy found the listing, not what a later
 * editing session would produce. No backfill: generating a draft for every stored listing would spend
 * API credits on flats nobody is applying to any more, and an old row with NULL reads as "no draft"
 * exactly as before.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('application_draft')) {
    db.exec(`ALTER TABLE listings ADD COLUMN application_draft TEXT`);
  }
  if (missing('application_draft_generated_at')) {
    db.exec(`ALTER TABLE listings ADD COLUMN application_draft_generated_at INTEGER`);
  }
  if (missing('application_draft_model')) {
    db.exec(`ALTER TABLE listings ADD COLUMN application_draft_model TEXT`);
  }
}
