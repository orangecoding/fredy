/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Second attempt to clear Anibis listings for re-enrichment.
 * The first enrichment attempt failed silently - this clears listings
 * so they can be re-scraped with improved logging to diagnose the issue.
 */
export function up(db) {
  const result = db.prepare(`DELETE FROM listings WHERE provider = 'anibis'`).run();
  console.warn(`[Migration 12] Deleted ${result.changes} Anibis listings for retry`);
}
