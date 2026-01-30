/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * One-time migration to clear Anibis listings.
 *
 * After PR #18 changed the hash format and added price enrichment via Puppeteer,
 * existing Anibis listings were stored with empty prices because Puppeteer
 * couldn't launch in the Docker container (missing executablePath).
 *
 * This migration deletes those listings so they'll be re-scraped as "new"
 * and properly enriched with real prices.
 */
export function up(db) {
  const result = db.prepare(`DELETE FROM listings WHERE provider = 'anibis'`).run();
  console.warn(`[Migration 11] Deleted ${result.changes} Anibis listings for re-enrichment`);
}
