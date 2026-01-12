/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

// Migration: Add geocoordinates to listings for map display

export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN latitude REAL;
    ALTER TABLE listings ADD COLUMN longitude REAL;
  `);
}
