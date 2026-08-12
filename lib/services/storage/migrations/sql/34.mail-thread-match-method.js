/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Extend mail match provenance with thread inheritance. SQLite cannot alter a
 * CHECK constraint in place, so the table is rebuilt while preserving rows.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.exec(`
    CREATE TABLE mail_message_listing_matches_next
    (
      message_id  TEXT PRIMARY KEY REFERENCES mail_messages (id) ON DELETE CASCADE,
      listing_id  TEXT    NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
      method      TEXT    NOT NULL CHECK (method IN ('listing_code', 'address', 'thread', 'manual')),
      confidence  INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    INSERT INTO mail_message_listing_matches_next
      (message_id, listing_id, method, confidence, created_at, updated_at)
    SELECT message_id, listing_id, method, confidence, created_at, updated_at
      FROM mail_message_listing_matches;

    DROP TABLE mail_message_listing_matches;
    ALTER TABLE mail_message_listing_matches_next RENAME TO mail_message_listing_matches;
    CREATE INDEX idx_mail_matches_listing_id ON mail_message_listing_matches (listing_id);
  `);
}
