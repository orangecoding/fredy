/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Persistent session storage.
 *
 * @fastify/session defaults to an in-memory store, which has three consequences Fredy actually
 * feels: every user is logged out by a restart (so every upgrade logs everyone out), the map grows
 * for as long as the process lives with nothing ever evicting expired entries, and running two
 * processes against one database is impossible because neither sees the other's sessions.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid        TEXT PRIMARY KEY,
      data       TEXT    NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  // The sweeper deletes by expiry, so that is what it should be able to scan.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at)`);
}
