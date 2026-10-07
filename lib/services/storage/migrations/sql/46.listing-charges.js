/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Whether a stored rent has the running charges in it, and what they come to.
 *
 * Providers store a rent the way the advert states it: without the charges where it gives a figure
 * without them, and with them where it gives nothing else - a French rent is quoted "charges
 * comprises" or "hors charges" advert by advert. Compared as bare numbers, the same flat quoted with
 * the charges on one portal and without them on another was two flats, and was notified twice. The
 * similarity cache reloads from this table every hour, so the basis has to be stored with the rent,
 * or it is gone by the time the flat turns up on the second portal.
 *
 * - `charges_included`: 1 with the charges, 0 without, NULL where the portal does not say. Every row
 *   stored before this migration is NULL, which is what "nobody said" is - not 0.
 * - `charges`: the monthly charges, where the advert states them.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('charges_included')) {
    db.exec(`ALTER TABLE listings ADD COLUMN charges_included INTEGER`);
  }
  if (missing('charges')) {
    db.exec(`ALTER TABLE listings ADD COLUMN charges REAL`);
  }
}
