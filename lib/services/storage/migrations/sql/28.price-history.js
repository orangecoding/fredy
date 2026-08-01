/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';

/**
 * Default number of days a listing is left alone before its price is checked again.
 * @type {number}
 */
export const DEFAULT_PRICE_CHECK_INTERVAL_DAYS = 7;

/**
 * Default smallest change, in percent, that is worth a notification.
 * @type {number}
 */
export const DEFAULT_PRICE_CHANGE_THRESHOLD_PERCENT = 1;

/**
 * Default ceiling on how many listings one price-tracking run may open.
 * @type {number}
 */
export const DEFAULT_PRICE_CHECK_LIMIT_PER_RUN = 100;

/**
 * Groundwork for tracking how a listing's price develops over time.
 *
 * One table and three columns:
 *
 * - `listing_price_history` is the actual series. It is a table rather than a JSON column on
 *   `listings` because the interesting questions are aggregate ones ("what dropped this week"), and
 *   because `ON DELETE CASCADE` then disposes of the history exactly when the listing goes - the
 *   retention purge needs no knowledge of this feature at all.
 * - `previous_price` and `price_changed_at` are denormalized onto the listing. The overview renders
 *   hundreds of rows at a time and only ever needs the latest delta, so making it join or
 *   sub-select the series for every row would be paying a lot for one number.
 * - `last_price_check_at` drives the price probe's own due query. It cannot share
 *   `last_checked_at` with the alive-checker: the two run on different schedules, and a shared
 *   column would make each one reset the other's clock, so whichever ran more often would starve
 *   the other completely.
 *
 * Every existing listing gets a baseline observation stamped with its `created_at`. Without it the
 * first probe after an upgrade produces a series of length one, which draws no chart, so price
 * history would appear broken for weeks on an instance that already has data.
 *
 * The settings are seeded off by default. Unlike the alive-check, a price probe opens a real
 * browser page per listing, so turning it on is a decision the operator has to make deliberately.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS listing_price_history (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      price INTEGER NOT NULL,
      observed_at INTEGER NOT NULL,
      source TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_price_history_listing ON listing_price_history (listing_id, observed_at)`);

  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (!columns.some((column) => column.name === 'previous_price')) {
    db.exec(`ALTER TABLE listings ADD COLUMN previous_price INTEGER`);
  }
  if (!columns.some((column) => column.name === 'price_changed_at')) {
    db.exec(`ALTER TABLE listings ADD COLUMN price_changed_at INTEGER`);
  }
  if (!columns.some((column) => column.name === 'last_price_check_at')) {
    db.exec(`ALTER TABLE listings ADD COLUMN last_price_check_at INTEGER`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_last_price_check ON listings (last_price_check_at)`);

  // Seeded only once. A re-run of the migration must not hand every listing a second baseline.
  const alreadySeeded = db.prepare(`SELECT 1 FROM listing_price_history WHERE source = 'backfill' LIMIT 1`).get();
  if (!alreadySeeded) {
    db.prepare(
      `INSERT INTO listing_price_history (id, listing_id, price, observed_at, source)
       SELECT lower(hex(randomblob(12))), id, price, COALESCE(created_at, @now), 'backfill'
       FROM listings
       WHERE price IS NOT NULL`,
    ).run({ now: Date.now() });
  }

  seedSetting(db, 'priceTrackingEnabled', false);
  seedSetting(db, 'priceCheckIntervalDays', DEFAULT_PRICE_CHECK_INTERVAL_DAYS);
  seedSetting(db, 'priceChangeThresholdPercent', DEFAULT_PRICE_CHANGE_THRESHOLD_PERCENT);
  seedSetting(db, 'priceCheckLimitPerRun', DEFAULT_PRICE_CHECK_LIMIT_PER_RUN);
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
