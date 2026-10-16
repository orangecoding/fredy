/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/48.listing-media.js';

/**
 * Nothing anywhere deletes a listing's pictures when the listing goes: the retention purge, a
 * deleted job and a manual hard delete all rely on the cascade. Dropping the foreign key would leave
 * orphaned BLOBs behind that nobody notices until the database no longer fits in a backup.
 */
describe('migration 48 - listing media', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`CREATE TABLE listings (id TEXT PRIMARY KEY, title TEXT)`);
  });

  afterEach(() => db.close());

  const addListing = (id) => db.prepare(`INSERT INTO listings (id, title) VALUES (?, ?)`).run(id, `listing ${id}`);

  const addMedia = (listingId) =>
    db
      .prepare(`INSERT INTO listing_media (listing_id, preview_mime, created_at, preview) VALUES (?, ?, ?, ?)`)
      .run(listingId, 'image/webp', Date.now(), Buffer.from('RIFF0000WEBP'));

  it('creates the table with the picture bytes as its last column', () => {
    up(db);

    const columns = db
      .prepare(`PRAGMA table_info(listing_media)`)
      .all()
      .map((column) => column.name);
    expect(columns).toEqual(['listing_id', 'gallery', 'preview_mime', 'preview_failed_at', 'created_at', 'preview']);
  });

  it('removes the pictures together with their listing', () => {
    up(db);
    addListing('l1');
    addListing('l2');
    addMedia('l1');
    addMedia('l2');

    db.prepare(`DELETE FROM listings WHERE id = ?`).run('l1');

    const left = db
      .prepare(`SELECT listing_id FROM listing_media`)
      .all()
      .map((row) => row.listing_id);
    expect(left).toEqual(['l2']);
  });

  it('refuses pictures for a listing that does not exist', () => {
    up(db);
    expect(() => addMedia('ghost')).toThrow(/FOREIGN KEY/);
  });

  it('keeps one row per listing', () => {
    up(db);
    addListing('l1');
    addMedia('l1');
    expect(() => addMedia('l1')).toThrow(/UNIQUE|PRIMARY KEY/);
  });

  it('is a no-op when run again', () => {
    up(db);
    addListing('l1');
    addMedia('l1');

    expect(() => up(db)).not.toThrow();
    expect(db.prepare(`SELECT COUNT(*) AS total FROM listing_media`).get().total).toBe(1);
  });
});
