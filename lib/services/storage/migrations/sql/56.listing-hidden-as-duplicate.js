/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Remember that a listing was hidden by the similarity check, as a copy of a flat another portal
 * had already brought in.
 *
 * Such a copy is soft-deleted like a listing the user hid, and its stored hash keeps every later
 * run from seeing it again. That is right while the first copy is online. Once the alive-checker
 * finds the first copy gone, the hidden one is the flat still on the market, and this mark is what
 * tells it apart from a listing the user hid on purpose, which has to stay hidden.
 *
 * Rows hidden before this column existed carry no mark and stay hidden: there is no telling them
 * apart after the fact.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (!columns.some((column) => column.name === 'hidden_as_duplicate')) {
    db.exec(`ALTER TABLE listings ADD COLUMN hidden_as_duplicate INTEGER NOT NULL DEFAULT 0`);
  }
}
