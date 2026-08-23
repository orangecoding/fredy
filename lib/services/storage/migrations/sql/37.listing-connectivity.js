/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';

/**
 * Default ceiling on how many listings one connectivity sweep works through.
 *
 * Mirrors `DEFAULT_CONNECTIVITY_LIMIT_PER_RUN` in the service. An instance upgrading with a full
 * database has a backlog to get through, and doing it in one burst against a public register is
 * the request pattern most likely to get an instance blocked. Two hundred per sweep clears a few
 * thousand listings over a day of six-hourly runs.
 * @type {number}
 */
export const DEFAULT_CONNECTIVITY_LIMIT_PER_RUN = 200;

/**
 * Default age at which a stored answer is looked up again, in days.
 * @type {number}
 */
export const DEFAULT_CONNECTIVITY_MAX_AGE_DAYS = 180;

/**
 * Which broadband and mobile coverage a listing's address has.
 *
 * Four columns on `listings` rather than a table of its own: there is exactly one answer per
 * listing and it is never queried in aggregate, so a table would buy nothing and cost a join on
 * the detail page.
 *
 * - `connectivity` is the readable answer, and the only thing the detail page renders.
 * - `connectivity_max_down`, `connectivity_fiber` and `connectivity_mobile` repeat three parts of
 *   it as flat, indexable values. The listings overview filters on them in the same WHERE clause
 *   that handles provider and status, and an expression over a JSON column cannot use an index.
 *   `connectivity_mobile` is a bitmask over technology and operator; see `mobileBits.js`.
 * - `connectivity_at` is when the lookup ran, successful or not. Stamping failures too is what
 *   keeps a listing whose address no register knows from being retried on every single sweep.
 *
 * The feature is seeded on. Unlike price tracking it opens no browser pages and sends two small
 * requests per address, throttled and cached, so there is nothing here an operator needs to
 * consent to beforehand - and the switches exist for the case where they disagree.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('connectivity')) {
    db.exec(`ALTER TABLE listings ADD COLUMN connectivity JSON`);
  }
  if (missing('connectivity_max_down')) {
    db.exec(`ALTER TABLE listings ADD COLUMN connectivity_max_down INTEGER`);
  }
  if (missing('connectivity_fiber')) {
    db.exec(`ALTER TABLE listings ADD COLUMN connectivity_fiber INTEGER`);
  }
  if (missing('connectivity_mobile')) {
    db.exec(`ALTER TABLE listings ADD COLUMN connectivity_mobile INTEGER`);
  }
  if (missing('connectivity_at')) {
    db.exec(`ALTER TABLE listings ADD COLUMN connectivity_at INTEGER`);
  }

  // The sweep's own due query reads this, and it is the column that decides which listings a run
  // picks up out of a table that can hold tens of thousands.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_connectivity_at ON listings (connectivity_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_connectivity_down ON listings (connectivity_max_down)`);

  seedSetting(db, 'connectivityEnabled', true);
  seedSetting(db, 'connectivitySources', { 'de-bba': true, 'ch-bakom': true });
  seedSetting(db, 'connectivityLimitPerRun', DEFAULT_CONNECTIVITY_LIMIT_PER_RUN);
  seedSetting(db, 'connectivityMaxAgeDays', DEFAULT_CONNECTIVITY_MAX_AGE_DAYS);
}

/**
 * Insert a global setting, but only when the operator has no value for it yet.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} name
 * @param {any} value
 * @returns {void}
 */
function seedSetting(db, name, value) {
  const exists = db.prepare(`SELECT 1 FROM settings WHERE name = @name AND user_id IS NULL LIMIT 1`).get({ name });
  if (exists) return;
  db.prepare(
    `INSERT INTO settings (id, create_date, name, value, user_id)
     VALUES (@id, @create_date, @name, @value, NULL)`,
  ).run({ id: nanoid(), create_date: Date.now(), name, value: JSON.stringify(value) });
}
