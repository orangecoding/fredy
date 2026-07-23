/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

// Migration: Replace the single distance_to_destination column with a per-address
// distances JSON column (supporting multiple named addresses for distance checking).
export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN distances JSONB DEFAULT NULL;
    ALTER TABLE listings DROP COLUMN distance_to_destination;
  `);
}
