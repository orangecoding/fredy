/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

// Migration: Adding a new table to store if somebody "watches" (a.k.a favorite) a listing

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_list
    (
      id         TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)    REFERENCES users    (id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_list ON watch_list (listing_id, user_id);
  `);
}
