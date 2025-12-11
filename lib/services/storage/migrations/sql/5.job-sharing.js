/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

// Migration: Adding a new table to store if somebody shared a job with someone

export function up(db) {
  db.exec(`
    ALTER TABLE jobs ADD COLUMN shared_with_user jsonb DEFAULT '[]'
  `);
}
