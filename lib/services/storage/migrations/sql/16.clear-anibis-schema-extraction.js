/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Clear Anibis listings to retry with schema.org-based price extraction.
 */
export function up(db) {
  const result = db.prepare(`DELETE FROM listings WHERE provider = 'anibis'`).run();
  console.warn(`[Migration 16] Deleted ${result.changes} Anibis listings`);
}
