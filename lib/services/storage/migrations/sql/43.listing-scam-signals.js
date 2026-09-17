/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { detectScamSignals } from '../../../listings/scamSignals.js';

/**
 * What a listing shows of a rental scam, and what the user said about it.
 *
 * Two columns, deliberately separate. `scam_signals` is the detector's reading and is rewritten
 * whenever the listing is examined again; `scam_override` is the user's word and is never touched by
 * anything but the user. Folding them into one column would mean a re-run silently erasing somebody's
 * decision, which is the one thing this feature must not do.
 *
 * The backfill needs no neighbours and no second query: every signal is read off the row itself,
 * including the price one, which compares two columns migration 41 already filled in. So it is a
 * single pass, and it runs after 41 for exactly that reason.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('scam_signals')) {
    db.exec(`ALTER TABLE listings ADD COLUMN scam_signals TEXT`);
  }
  if (missing('scam_override')) {
    db.exec(`ALTER TABLE listings ADD COLUMN scam_override TEXT`);
  }

  const rows = db
    .prepare(
      `SELECT id, title, description, price_per_sqm, market_median_sqm
       FROM listings
       WHERE manually_deleted = 0`,
    )
    .all();

  if (rows.length === 0) {
    return;
  }

  const write = db.prepare(`UPDATE listings SET scam_signals = @signals WHERE id = @id`);
  for (const row of rows) {
    const signals = detectScamSignals(row);
    // Null rather than an empty array for the ordinary case, which is almost every listing. It keeps
    // the column empty where there is nothing to say, so "has this been examined" and "did anything
    // turn up" do not have to be told apart by parsing JSON on every read.
    write.run({ id: row.id, signals: signals.length === 0 ? null : JSON.stringify(signals) });
  }
}
