/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Clear Anibis listings to retry with Puppeteer-based search page fetch.
 * Previous attempts failed because direct HTTP fetch was blocked by anti-bot.
 */
export function up(db) {
  const result = db.prepare(`DELETE FROM listings WHERE provider = 'anibis'`).run();
  console.warn(`[Migration 13] Deleted ${result.changes} Anibis listings for Puppeteer retry`);
}
