/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * Reactivation is the only path in Fredy that sets `is_active` back to 1, and it exists because the
 * alive-checker guesses wrong often enough to lose a curated listing. These tests pin the two halves
 * that make the correction stick: the write clears everything the deactivation left behind, and the
 * nightly checker never gets the row handed to it again.
 */
describe('reactivateListings', () => {
  let db;
  let listingsStorage;

  const DAY = 24 * 60 * 60 * 1000;
  const NOW = 1_800_000_000_000;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        provider TEXT,
        link TEXT,
        title TEXT,
        is_active INTEGER,
        manually_deleted INTEGER DEFAULT 0,
        inactive_since INTEGER,
        active_check_failures INTEGER DEFAULT 0,
        activity_is_manual INTEGER NOT NULL DEFAULT 0,
        last_checked_at INTEGER
      );
    `);

    vi.resetModules();
    vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params),
        execute: (sql, params) => db.prepare(sql).run(params),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    vi.doMock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  const addListing = (
    id,
    { isActive = 0, inactiveSince = NOW - 30 * DAY, deleted = 0, failures = 3, manual = 0, lastCheckedAt = null } = {},
  ) =>
    db
      .prepare(
        `INSERT INTO listings (id, job_id, provider, link, title, is_active, manually_deleted, inactive_since,
                               active_check_failures, activity_is_manual, last_checked_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        'job-1',
        'immoscout',
        `https://example.com/${id}`,
        'flat',
        isActive,
        deleted,
        inactiveSince,
        failures,
        manual,
        lastCheckedAt,
      );

  const read = (id) => db.prepare(`SELECT * FROM listings WHERE id = ?`).get(id);

  it('puts the listing back and clears every trace of the deactivation', () => {
    addListing('gone');

    listingsStorage.reactivateListings(['gone']);

    const row = read('gone');
    expect(row.is_active).toBe(1);
    // Left set, the retention purge would hard delete the row days later without anyone asking.
    expect(row.inactive_since).toBeNull();
    expect(row.active_check_failures).toBe(0);
    expect(row.activity_is_manual).toBe(1);
  });

  it('leaves listings the user soft-deleted alone', () => {
    addListing('hidden', { deleted: 1 });

    listingsStorage.reactivateListings(['hidden']);

    // Undeleting is what /restore is for. Reactivating must not drag a row out of the hidden view.
    expect(read('hidden').is_active).toBe(0);
    expect(read('hidden').manually_deleted).toBe(1);
  });

  it('touches only the ids it was given', () => {
    addListing('gone');
    addListing('other');

    listingsStorage.reactivateListings(['gone']);

    expect(read('other').is_active).toBe(0);
    expect(read('other').activity_is_manual).toBe(0);
  });

  it('does nothing on an empty id list', () => {
    addListing('gone');

    listingsStorage.reactivateListings([]);

    expect(read('gone').is_active).toBe(0);
  });
});
