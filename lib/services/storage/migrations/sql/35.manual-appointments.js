/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Store viewing appointments independently from listing status. Appointments are created and
 * edited only by the signed-in user; no mailbox or automation data is involved.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE manual_appointments (
      id          TEXT PRIMARY KEY,
      listing_id  TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      starts_at   INTEGER NOT NULL,
      timezone    TEXT NOT NULL DEFAULT 'Europe/Berlin',
      location    TEXT,
      state       TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (state IN ('scheduled', 'completed', 'cancelled')),
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      UNIQUE (listing_id, user_id)
    );

    CREATE INDEX idx_manual_appointments_user_start
      ON manual_appointments(user_id, starts_at);
  `);
}
