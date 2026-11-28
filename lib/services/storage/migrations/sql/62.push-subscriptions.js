/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The devices a user receives Web Push notifications on (#542).
 *
 * One row per browser subscription, i.e. per browser profile on one device. A subscription belongs
 * to the user, not to the session: push has to keep arriving after `sessionTTL` has signed the
 * session out, because the moment a listing appears is usually a moment the app is closed.
 *
 * - `endpoint` is the push service URL the browser handed out. It identifies the device and is
 *   unique, so subscribing the same browser again updates its row instead of adding a second one.
 * - `p256dh` and `auth` are the browser's keys the payload is encrypted with (RFC 8291).
 * - `origin` is the https origin the device subscribed from, the VAPID contact when `baseUrl` is
 *   not an https URL (Apple refuses a token without an https or mailto subject).
 * - `last_success_at` and `last_error` are shown in the device list, so a device that stopped
 *   receiving is visible before somebody wonders why.
 *
 * `ON DELETE CASCADE` disposes of the rows with the user, the same way the other per-user tables
 * do. Backups carry the table because they copy the whole database.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscription (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint        TEXT NOT NULL UNIQUE,
      p256dh          TEXT NOT NULL,
      auth            TEXT NOT NULL,
      origin          TEXT,
      user_agent      TEXT,
      created_at      INTEGER NOT NULL,
      last_success_at INTEGER,
      last_error      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_push_subscription_user ON push_subscription (user_id);
  `);
}
