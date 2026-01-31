/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Clear Anibis listings to retry with networkidle0 wait and better debugging.
 */
export function up(db) {
  const result = db.prepare(`DELETE FROM listings WHERE provider = 'anibis'`).run();
  console.warn(`[Migration 14] Deleted ${result.changes} Anibis listings`);
}
