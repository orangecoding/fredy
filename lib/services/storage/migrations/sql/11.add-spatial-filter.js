/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

// Migration: Add spatial_filter column to jobs table for storing GeoJSON-based spatial filters
export function up(db) {
  db.exec(`
    ALTER TABLE jobs ADD COLUMN spatial_filter JSONB DEFAULT NULL;
  `);
}
