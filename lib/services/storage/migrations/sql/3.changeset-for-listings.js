/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

// Migration: Adding a changeset field to the listings table in preparation for
// a price watch feature

export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN change_set jsonb;
  `);
}
