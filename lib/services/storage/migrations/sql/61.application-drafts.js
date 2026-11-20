/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * AI application drafts: the draft stored per listing, and the per-job switch that writes them for
 * the new listings a run finds.
 *
 * On the listing, two metadata columns rather than a computed view, following the benchmark/median
 * pattern of migration 41: the draft states what the model wrote when it was asked, not what a
 * later editing session would produce. No backfill: generating a draft for every stored listing
 * would spend API credits on flats nobody is applying to any more, and an old row with NULL reads as
 * "no draft" exactly as before.
 *
 * On the job, off for every existing one: a run writing drafts costs the admin a request per new
 * listing, so no job starts doing it without its owner switching it on.
 *
 * Idempotent column by column, because installations that ran an earlier build of this feature
 * already have the listing columns.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columnsOf = (table) =>
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((column) => column.name);

  const listingColumns = columnsOf('listings');
  if (!listingColumns.includes('application_draft')) {
    db.exec(`ALTER TABLE listings ADD COLUMN application_draft TEXT`);
  }
  if (!listingColumns.includes('application_draft_generated_at')) {
    db.exec(`ALTER TABLE listings ADD COLUMN application_draft_generated_at INTEGER`);
  }
  if (!listingColumns.includes('application_draft_model')) {
    db.exec(`ALTER TABLE listings ADD COLUMN application_draft_model TEXT`);
  }

  if (!columnsOf('jobs').includes('application_drafts')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN application_drafts INTEGER NOT NULL DEFAULT 0`);
  }
}
