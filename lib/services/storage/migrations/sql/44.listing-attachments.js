/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';

/**
 * Default ceiling for a single uploaded document, in megabytes.
 *
 * Capped at 50 wherever it is validated, because `lib/api/api.js` sets a global 50 MB body limit
 * and a larger setting could only ever produce a 413 from Fastify before any handler runs.
 * @type {number}
 */
export const DEFAULT_LISTING_ATTACHMENT_MAX_MB = 10;

/**
 * Default number of documents one listing may carry.
 * @type {number}
 */
export const DEFAULT_LISTING_ATTACHMENT_MAX_PER_LISTING = 20;

/**
 * Documents a user attaches to a listing: the exposé, the floor plan, the photos the agent sent.
 *
 * The bytes live in a BLOB rather than in a directory next to the database, and that is the whole
 * point of the design. Fredy usually runs in a container whose filesystem is thrown away, and the
 * only thing a user is told to persist is the `/db` volume - so the database is the one place
 * uploaded bytes are already safe. Three things then come for free:
 *
 * - Backups. `backupRestoreService` copies the entire database, so documents are in every backup
 *   without that code learning this table exists.
 * - Deletion. `foreign_keys = ON` is set on every connection, so `ON DELETE CASCADE` disposes of
 *   the rows exactly when the listing goes - the retention purge, a deleted job and a manual hard
 *   delete all clean up by themselves. Files on disk would need an unlink in every one of those
 *   paths plus a sweeper for the ones that were missed.
 * - No path to traverse. There is no filename that can escape anywhere, because no filename ever
 *   reaches a filesystem.
 *
 * It is the same argument `28.price-history.js` records for choosing a child table over a JSON
 * column, one step further.
 *
 * The price is that the database grows by whatever people upload, which is what the two seeded
 * settings are for.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS listing_attachments (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      content BLOB NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listing_attachments_listing ON listing_attachments (listing_id)`);

  seedSetting(db, 'listingAttachmentMaxMb', DEFAULT_LISTING_ATTACHMENT_MAX_MB);
  seedSetting(db, 'listingAttachmentMaxPerListing', DEFAULT_LISTING_ATTACHMENT_MAX_PER_LISTING);
}

/**
 * Insert a global setting, but only when the operator has no value for it yet.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} name
 * @param {any} value
 * @returns {void}
 */
function seedSetting(db, name, value) {
  const exists = db.prepare(`SELECT 1 FROM settings WHERE name = @name AND user_id IS NULL LIMIT 1`).get({ name });
  if (exists) return;
  db.prepare(
    `INSERT INTO settings (id, create_date, name, value, user_id)
     VALUES (@id, @create_date, @name, @value, NULL)`,
  ).run({ id: nanoid(), create_date: Date.now(), name, value: JSON.stringify(value) });
}
