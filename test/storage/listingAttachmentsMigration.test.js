/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import {
  up,
  DEFAULT_LISTING_ATTACHMENT_MAX_MB,
  DEFAULT_LISTING_ATTACHMENT_MAX_PER_LISTING,
} from '../../lib/services/storage/migrations/sql/44.listing-attachments.js';

/**
 * The whole design rests on the cascade: nothing anywhere unlinks an attachment when a listing goes
 * away, because SQLite is supposed to. If the foreign key were ever dropped from this table, the
 * retention purge would start leaving orphaned blobs behind and nobody would notice until the
 * database stopped fitting in a backup.
 */
describe('migration 44 - listing attachments', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        title TEXT
      );
      CREATE TABLE settings (
        id TEXT PRIMARY KEY,
        create_date INTEGER,
        name TEXT,
        value TEXT,
        user_id TEXT
      );
    `);
  });

  afterEach(() => db.close());

  const settingValue = (name) =>
    db.prepare(`SELECT value FROM settings WHERE name = ? AND user_id IS NULL`).get(name)?.value;

  const addListing = (id) => db.prepare(`INSERT INTO listings (id, title) VALUES (?, ?)`).run(id, `listing ${id}`);

  const addAttachment = (id, listingId, content = Buffer.from('%PDF-1.7')) =>
    db
      .prepare(
        `INSERT INTO listing_attachments (id, listing_id, filename, mime_type, size, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, listingId, 'expose.pdf', 'application/pdf', content.length, content, Date.now());

  it('creates the table and its index', () => {
    up(db);

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all()
      .map((row) => row.name);
    expect(tables).toContain('listing_attachments');

    const indexes = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'listing_attachments'`)
      .all()
      .map((row) => row.name);
    expect(indexes).toContain('idx_listing_attachments_listing');
  });

  it('seeds both limits with their defaults', () => {
    up(db);

    expect(settingValue('listingAttachmentMaxMb')).toBe(JSON.stringify(DEFAULT_LISTING_ATTACHMENT_MAX_MB));
    expect(settingValue('listingAttachmentMaxPerListing')).toBe(
      JSON.stringify(DEFAULT_LISTING_ATTACHMENT_MAX_PER_LISTING),
    );
  });

  it('leaves a limit the operator already chose alone', () => {
    db.prepare(
      `INSERT INTO settings (id, create_date, name, value, user_id)
       VALUES ('s1', 1, 'listingAttachmentMaxMb', '25', NULL)`,
    ).run();

    up(db);

    expect(settingValue('listingAttachmentMaxMb')).toBe('25');
  });

  it('runs twice without complaining', () => {
    up(db);
    expect(() => up(db)).not.toThrow();

    const seeded = db
      .prepare(`SELECT COUNT(*) AS total FROM settings WHERE name = 'listingAttachmentMaxMb'`)
      .get().total;
    expect(seeded).toBe(1);
  });

  it('round-trips the bytes it was given', () => {
    up(db);
    addListing('listing-1');
    const content = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
    addAttachment('att-1', 'listing-1', content);

    const row = db.prepare(`SELECT content, size FROM listing_attachments WHERE id = 'att-1'`).get();
    expect(Buffer.isBuffer(row.content)).toBe(true);
    expect(row.content.equals(content)).toBe(true);
    expect(row.size).toBe(content.length);
  });

  it('takes the attachments with the listing when it is deleted', () => {
    up(db);
    addListing('listing-1');
    addListing('listing-2');
    addAttachment('att-1', 'listing-1');
    addAttachment('att-2', 'listing-1');
    addAttachment('att-3', 'listing-2');

    db.prepare(`DELETE FROM listings WHERE id = 'listing-1'`).run();

    const remaining = db
      .prepare(`SELECT id FROM listing_attachments`)
      .all()
      .map((row) => row.id);
    expect(remaining).toEqual(['att-3']);
  });

  it('refuses an attachment for a listing that does not exist', () => {
    up(db);
    expect(() => addAttachment('att-1', 'nope')).toThrow();
  });
});
