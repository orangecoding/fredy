/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * Every listing the alive-checker looks at costs one outbound HTTP request. It used to take every
 * active listing on every nightly run, which on a large instance is a long stream of traffic at a
 * handful of hosts - and a blocked address there breaks scraping too. These tests pin the two
 * bounds that replaced that: a per-run cap, and a staleness window.
 */
describe('alive checker throttling', () => {
  let db;
  let listingsStorage;

  const DAY = 24 * 60 * 60 * 1000;
  const NOW = 1_800_000_000_000;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        link TEXT,
        provider TEXT,
        job_id TEXT,
        is_active INTEGER,
        manually_deleted INTEGER DEFAULT 0,
        last_checked_at INTEGER
      );
    `);

    vi.resetModules();
    vi.doMock('../../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params),
        execute: (sql, params) => db.prepare(sql).run(params),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    vi.doMock('../../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
    listingsStorage = await import('../../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => {
    db.close();
  });

  const addListing = (id, { isActive = 1, lastCheckedAt = null, deleted = 0 } = {}) =>
    db
      .prepare(
        'INSERT INTO listings (id, link, provider, job_id, is_active, manually_deleted, last_checked_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(id, `https://example.com/${id}`, 'immowelt', 'job-1', isActive, deleted, lastCheckedAt);

  const dueIds = (opts = {}) =>
    listingsStorage.getListingsDueForActiveCheck({ now: NOW, ...opts }).map((row) => row.id);

  it('includes listings that were never checked', () => {
    addListing('never-checked');
    expect(dueIds()).toEqual(['never-checked']);
  });

  it('excludes a listing checked inside the staleness window', () => {
    addListing('fresh', { lastCheckedAt: NOW - DAY });
    expect(dueIds()).toEqual([]);
  });

  it('includes a listing checked longer ago than the window', () => {
    addListing('stale', { lastCheckedAt: NOW - 8 * DAY });
    expect(dueIds()).toEqual(['stale']);
  });

  it('honours a custom staleness window', () => {
    addListing('two-days-old', { lastCheckedAt: NOW - 2 * DAY });
    expect(dueIds({ staleAfterMs: 7 * DAY })).toEqual([]);
    expect(dueIds({ staleAfterMs: DAY })).toEqual(['two-days-old']);
  });

  it('caps how many listings one run takes', () => {
    for (let i = 0; i < 50; i++) addListing(`id-${i}`);
    expect(dueIds({ limit: 10 })).toHaveLength(10);
  });

  it('serves never-checked listings before the least recently checked ones', () => {
    addListing('checked-long-ago', { lastCheckedAt: NOW - 30 * DAY });
    addListing('never');
    addListing('checked-a-while-ago', { lastCheckedAt: NOW - 10 * DAY });

    // Never checked first, then oldest first - so nothing is starved by a large backlog.
    expect(dueIds()).toEqual(['never', 'checked-long-ago', 'checked-a-while-ago']);
  });

  it('ignores inactive and hidden listings', () => {
    addListing('gone', { isActive: 0 });
    addListing('hidden', { deleted: 1 });
    addListing('unknown', { isActive: null });
    expect(dueIds()).toEqual(['unknown']);
  });

  it('only selects the columns the checker needs', () => {
    addListing('lean');
    expect(Object.keys(listingsStorage.getListingsDueForActiveCheck({ now: NOW })[0]).sort()).toEqual([
      'id',
      'link',
      'provider',
    ]);
  });

  describe('markListingsChecked', () => {
    it('stops a listing from coming back as due', () => {
      addListing('probed');
      listingsStorage.markListingsChecked(['probed'], NOW);
      expect(dueIds()).toEqual([]);
    });

    it('handles a batch beyond the SQLite parameter limit', () => {
      const ids = [];
      for (let i = 0; i < 1500; i++) {
        addListing(`bulk-${i}`);
        ids.push(`bulk-${i}`);
      }
      listingsStorage.markListingsChecked(ids, NOW);
      expect(dueIds({ limit: 5000 })).toEqual([]);
    });

    it('is a no-op for an empty list', () => {
      expect(listingsStorage.markListingsChecked([])).toBeUndefined();
    });
  });
});
