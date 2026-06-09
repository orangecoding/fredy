/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Migration: create the debug_logs table used by the opt-in "Debug Logging" feature.
 *
 * Each row is a single log line (timestamp + level + message) captured by the in-app
 * logger while debug logging is enabled. We store the UTF-8 byte size of the message
 * alongside the row so the debugLogStorage can maintain a rolling 5 MB cap without
 * having to run length() / SUM() on every insert.
 *
 * The "debug_logging_enabled" and "debug_logging_ever_enabled" flags are persisted in
 * the existing settings table (no schema change needed there) and are managed by
 * debugLogStorage.js at runtime.
 */
export function up(db) {
  // id is INTEGER PRIMARY KEY AUTOINCREMENT, which is an alias for SQLite's rowid and
  // is implicitly indexed. No additional index needed; selecting / deleting by id and
  // ordering by id ASC (rolling buffer) both use the existing rowid index.
  db.exec(`
    CREATE TABLE IF NOT EXISTS debug_logs
    (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      ts        INTEGER NOT NULL,
      level     TEXT    NOT NULL,
      message   TEXT    NOT NULL,
      byte_size INTEGER NOT NULL
    );
  `);
}
