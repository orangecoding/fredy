/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';

/**
 * Default number of days an offline listing is kept before it is hard deleted.
 * @type {number}
 */
export const DEFAULT_LISTING_RETENTION_DAYS = 14;

/**
 * Groundwork for automatically hard deleting listings that went offline.
 *
 * Two columns and one setting:
 *
 * - `inactive_since` is the start of the retention period. `is_active = 0` alone cannot drive a
 *   deletion because it carries no timestamp, and `last_checked_at` is the wrong one: it moves on
 *   every probe.
 * - `active_check_failures` counts consecutive failed probes (IP block, connection drop). Those
 *   never produce a verdict, so without a counter such a listing stays active forever. After enough
 *   failures the alive-checker treats it as gone.
 * - `listingRetentionDays` is the configurable grace period, seeded to the default only when the
 *   operator has no value yet.
 *
 * Listings that are already inactive are stamped with the migration timestamp rather than with
 * `last_checked_at` or `created_at`. Those would put most of the existing backlog past the grace
 * period immediately, so the first run after an upgrade would hard delete rows the operator has
 * never been told about. Stamping "now" purges the backlog one retention period later instead,
 * which leaves time to tune or disable the setting.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (!columns.some((column) => column.name === 'inactive_since')) {
    db.exec(`ALTER TABLE listings ADD COLUMN inactive_since INTEGER`);
  }
  if (!columns.some((column) => column.name === 'active_check_failures')) {
    db.exec(`ALTER TABLE listings ADD COLUMN active_check_failures INTEGER DEFAULT 0`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_inactive_since ON listings (inactive_since)`);

  db.prepare(`UPDATE listings SET inactive_since = @now WHERE is_active = 0 AND inactive_since IS NULL`).run({
    now: Date.now(),
  });

  const exists = db
    .prepare(`SELECT 1 FROM settings WHERE name = 'listingRetentionDays' AND user_id IS NULL LIMIT 1`)
    .get();
  if (exists) return;

  db.prepare(
    `INSERT INTO settings (id, create_date, name, value, user_id)
     VALUES (@id, @create_date, 'listingRetentionDays', @value, NULL)`,
  ).run({ id: nanoid(), create_date: Date.now(), value: JSON.stringify(DEFAULT_LISTING_RETENTION_DAYS) });
}
