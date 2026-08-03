/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Remember that a listing's address was chosen by a human.
 *
 * Portals report the address they feel like reporting: sometimes the street, often only the
 * district, occasionally nothing at all. Somebody reading the description and the photos can
 * usually do better, and this column is what keeps that correction from being quietly undone -
 * every automated writer of address or coordinates can be told to leave a flagged row alone.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (!columns.some((column) => column.name === 'address_is_manual')) {
    db.exec(`ALTER TABLE listings ADD COLUMN address_is_manual INTEGER NOT NULL DEFAULT 0`);
  }
}
