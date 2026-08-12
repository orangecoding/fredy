/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Connect incoming messages to listings without changing either source row.
 *
 * One message can describe only one application, while several messages may
 * belong to the same listing. The method records whether Fredy made the match
 * or a user selected it explicitly.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.exec(`
    CREATE TABLE mail_message_listing_matches
    (
      message_id  TEXT PRIMARY KEY REFERENCES mail_messages (id) ON DELETE CASCADE,
      listing_id  TEXT    NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
      method      TEXT    NOT NULL CHECK (method IN ('listing_code', 'address', 'manual')),
      confidence  INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE INDEX idx_mail_matches_listing_id ON mail_message_listing_matches (listing_id);
  `);
}
