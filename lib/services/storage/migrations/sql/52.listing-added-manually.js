/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Remember that a listing was added by hand, by pasting its URL, rather than found by a job run.
 *
 * Such a listing is stored under one of the user's jobs like any other, which is what gives it the
 * job's deal type, distances, commute times and price alerts. Without a mark it would be
 * indistinguishable from what the job found, and the listing detail could not say why a listing is
 * there that the job never announced.
 *
 * Written on insert only. A job run that later finds the same advert lands on the stored row, and
 * the mark stays.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (!columns.some((column) => column.name === 'added_manually')) {
    db.exec(`ALTER TABLE listings ADD COLUMN added_manually INTEGER NOT NULL DEFAULT 0`);
  }
}
