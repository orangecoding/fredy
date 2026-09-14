/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The card shows "3 attached documents" from a count the page query works out per row.
 *
 * It is a scalar subquery rather than another LEFT JOIN, and that is the whole reason this runs
 * against a real database: a join would return one row per document, so a listing with three of
 * them would appear three times and the page total would disagree with the page. Against a mocked
 * connection both shapes look identical.
 */

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params) => db.prepare(sql).all(params ?? {}),
    execute: (sql, params) => db.prepare(sql).run(params ?? {}),
    withTransaction: (fn) => db.transaction(fn)(db),
  },
}));
vi.mock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));

const USER = 'user-1';

describe('queryListings attachment count against real SQLite', () => {
  let listingsStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT,
        shared_with_user TEXT DEFAULT '[]',
        deal_type TEXT
      );
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        price REAL,
        title TEXT,
        status TEXT,
        distances TEXT,
        created_at INTEGER DEFAULT 0,
        published_at INTEGER,
        is_active INTEGER DEFAULT 1,
        manually_deleted INTEGER DEFAULT 0
      );
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
      CREATE TABLE listing_attachments (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        filename TEXT,
        mime_type TEXT,
        size INTEGER,
        content BLOB,
        created_at INTEGER
      );
      CREATE TABLE listing_travel_times (
        listing_id TEXT NOT NULL,
        label TEXT NOT NULL,
        transit_minutes INTEGER,
        car_minutes INTEGER,
        bike_minutes INTEGER,
        walk_minutes INTEGER,
        estimate_mode TEXT,
        is_estimate INTEGER NOT NULL DEFAULT 1,
        reference_time INTEGER,
        computed_at INTEGER,
        PRIMARY KEY (listing_id, label)
      );
    `);

    db.prepare(`INSERT INTO jobs (id, user_id, name, deal_type) VALUES ('job-1', ?, 'A job', 'rent')`).run(USER);

    const insertListing = db.prepare(`INSERT INTO listings (id, job_id, price, title) VALUES (?, 'job-1', 900, ?)`);
    for (const id of ['three-docs', 'one-doc', 'no-docs']) {
      insertListing.run(id, id);
    }

    const insertAttachment = db.prepare(
      `INSERT INTO listing_attachments (id, listing_id, filename, mime_type, size, content, created_at)
       VALUES (?, ?, 'expose.pdf', 'application/pdf', 8, ?, 0)`,
    );
    const pdf = Buffer.from('%PDF-1.7');
    insertAttachment.run('a1', 'three-docs', pdf);
    insertAttachment.run('a2', 'three-docs', pdf);
    insertAttachment.run('a3', 'three-docs', pdf);
    insertAttachment.run('a4', 'one-doc', pdf);

    vi.resetModules();
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  const page = () => listingsStorage.queryListings({ userId: USER, pageSize: 100 });

  it('counts the documents on each listing', () => {
    const counts = Object.fromEntries(page().result.map((row) => [row.id, row.attachmentCount]));
    expect(counts).toEqual({ 'three-docs': 3, 'one-doc': 1, 'no-docs': 0 });
  });

  it('reports zero rather than null for a listing with none, so the card can compare it', () => {
    const row = page().result.find((entry) => entry.id === 'no-docs');
    expect(row.attachmentCount).toBe(0);
  });

  it('does not multiply the page, which a join would', () => {
    const result = page();
    expect(result.result.map((row) => row.id).sort()).toEqual(['no-docs', 'one-doc', 'three-docs']);
    // The count query has no knowledge of attachments at all, so a duplicated page would also make
    // the total disagree with what is on it.
    expect(result.totalNumber).toBe(3);
  });
});
