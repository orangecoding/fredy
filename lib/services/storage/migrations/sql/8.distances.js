/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

// Migration: Removing city field and adding distance field

export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN distance_to_destination INTEGER;
  `);
}
