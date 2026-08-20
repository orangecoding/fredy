/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The retention purge is the only place in Fredy that deletes listings without a human asking for it,
 * and the delete is irreversible. These tests pin what it is allowed to touch: only listings the
 * alive-checker confirmed as gone, only after the grace period, and never one that somebody has on
 * their watch list.
 */
describe('purgeExpiredInactiveListings', () => {
  let db;
  let listingsStorage;
  let removeEntry;

  const DAY = 24 * 60 * 60 * 1000;
  const NOW = 1_800_000_000_000;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        provider TEXT,
        title TEXT,
        address TEXT,
        price REAL,
        size REAL,
        rooms REAL,
        is_active INTEGER,
        manually_deleted INTEGER DEFAULT 0,
        inactive_since INTEGER,
        active_check_failures INTEGER DEFAULT 0
      );
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
    `);

    removeEntry = vi.fn();
    vi.resetModules();
    vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params),
        execute: (sql, params) => db.prepare(sql).run(params),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    vi.doMock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry }));
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  const addListing = (
    id,
    { isActive = 0, inactiveSince = NOW - 30 * DAY, deleted = 0, title = 'flat', address = 'street 1' } = {},
  ) =>
    db
      .prepare(
        `INSERT INTO listings (id, job_id, title, address, price, is_active, manually_deleted, inactive_since)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(id, 'job-1', title, address, 1000, isActive, deleted, inactiveSince);

  const watch = (listingId) =>
    db
      .prepare(`INSERT INTO watch_list (id, listing_id, user_id) VALUES (?,?,?)`)
      .run(`w-${listingId}`, listingId, 'u1');

  const purge = (retentionDays = 14) => listingsStorage.purgeExpiredInactiveListings({ retentionDays, now: NOW });
  const remainingIds = () =>
    db
      .prepare(`SELECT id FROM listings ORDER BY id`)
      .all()
      .map((row) => row.id);

  it('deletes a listing that has been offline longer than the retention period', () => {
    addListing('long-gone', { inactiveSince: NOW - 15 * DAY });
    expect(purge(14).changes).toBe(1);
    expect(remainingIds()).toEqual([]);
  });

  it('keeps a listing that is still inside its grace period', () => {
    addListing('recently-gone', { inactiveSince: NOW - 13 * DAY });
    expect(purge(14).changes).toBe(0);
    expect(remainingIds()).toEqual(['recently-gone']);
  });

  it('deletes exactly on the boundary and not a millisecond before', () => {
    // 14 days configured: the listing survives day 14 and goes on day 15.
    addListing('boundary', { inactiveSince: NOW - 14 * DAY });
    addListing('one-ms-short', { inactiveSince: NOW - 14 * DAY + 1 });
    purge(14);
    expect(remainingIds()).toEqual(['one-ms-short']);
  });

  it('never touches an active listing', () => {
    addListing('alive', { isActive: 1, inactiveSince: null });
    // Defensive: a stale timestamp on an active row must not be enough to delete it.
    addListing('alive-with-stamp', { isActive: 1, inactiveSince: NOW - 90 * DAY });
    purge(14);
    expect(remainingIds()).toEqual(['alive', 'alive-with-stamp']);
  });

  it('keeps listings whose availability was never determined', () => {
    // is_active IS NULL means "unknown", which is not the same as gone.
    addListing('unknown', { isActive: null, inactiveSince: null });
    purge(14);
    expect(remainingIds()).toEqual(['unknown']);
  });

  it('keeps an inactive listing that has no timestamp at all', () => {
    addListing('no-stamp', { inactiveSince: null });
    purge(14);
    expect(remainingIds()).toEqual(['no-stamp']);
  });

  it('never deletes a listing on somebody watch list', () => {
    addListing('favourite', { inactiveSince: NOW - 400 * DAY });
    watch('favourite');
    expect(purge(14).changes).toBe(0);
    expect(remainingIds()).toEqual(['favourite']);
  });

  it('deletes an expired listing the user had already hidden', () => {
    addListing('hidden', { deleted: 1, inactiveSince: NOW - 20 * DAY });
    purge(14);
    expect(remainingIds()).toEqual([]);
  });

  it('deletes nothing when retention is disabled', () => {
    addListing('gone', { inactiveSince: NOW - 400 * DAY });
    expect(purge(0).changes).toBe(0);
    expect(listingsStorage.purgeExpiredInactiveListings({ retentionDays: undefined, now: NOW }).changes).toBe(0);
    expect(remainingIds()).toEqual(['gone']);
  });

  it('evicts deleted listings from the similarity cache', () => {
    // Without eviction the next scan would rediscover the listing, match the stale cache entry and
    // soft-delete the fresh row as a duplicate.
    addListing('gone', { title: 'Nice flat', address: 'Main street 3' });
    purge(14);
    expect(removeEntry).toHaveBeenCalledWith({
      jobId: 'job-1',
      provider: null,
      title: 'Nice flat',
      address: 'Main street 3',
      price: 1000,
      size: null,
      rooms: null,
    });
  });

  it('does not evict a listing the user had hidden by hand', () => {
    // A hidden listing was never in the cache, so evicting it would drop somebody else's entry.
    addListing('hidden', { deleted: 1 });
    purge(14);
    expect(removeEntry).not.toHaveBeenCalled();
  });
});
