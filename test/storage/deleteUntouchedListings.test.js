/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The commute re-check removes listings long after they were found, without anybody asking at that
 * moment. These tests pin the one promise that makes that acceptable: a listing somebody already did
 * something with is never the one that goes.
 */
describe('deleteUntouchedListingsById', () => {
  let db;
  let listingsStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        manually_deleted INTEGER NOT NULL DEFAULT 0,
        added_manually INTEGER NOT NULL DEFAULT 0,
        activity_is_manual INTEGER NOT NULL DEFAULT 0,
        address_is_manual INTEGER NOT NULL DEFAULT 0,
        scam_override TEXT,
        status JSON,
        notes TEXT
      );
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
      CREATE TABLE listing_attachments (id TEXT PRIMARY KEY, listing_id TEXT);
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
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  const addListing = (id, columns = {}) => {
    const row = { id, job_id: 'job-1', ...columns };
    const names = Object.keys(row);
    db.prepare(`INSERT INTO listings (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(
      ...Object.values(row),
    );
  };

  const deletedIds = () =>
    db
      .prepare(`SELECT id FROM listings WHERE manually_deleted = 1 ORDER BY id`)
      .all()
      .map((row) => row.id);

  it('soft deletes a listing nobody has done anything with', () => {
    addListing('untouched');

    const result = listingsStorage.deleteUntouchedListingsById(['untouched']);

    expect(result.changes).toBe(1);
    expect(deletedIds()).toEqual(['untouched']);
    // A tombstone, not a removal: the row is what stops the next run finding the listing again.
    expect(db.prepare(`SELECT COUNT(*) AS n FROM listings`).get().n).toBe(1);
  });

  it.each([
    ['added by hand', { added_manually: 1 }],
    ['given a status', { status: JSON.stringify({ status: 'applied', setAt: 1 }) }],
    ['given notes', { notes: 'call the landlord' }],
    ['marked online or offline by hand', { activity_is_manual: 1 }],
    ['given a corrected address', { address_is_manual: 1 }],
    ['given a scam verdict', { scam_override: 'safe' }],
  ])('leaves a listing alone that was %s', (_, columns) => {
    addListing('touched', columns);

    expect(listingsStorage.deleteUntouchedListingsById(['touched']).changes).toBe(0);
    expect(deletedIds()).toEqual([]);
  });

  it('leaves a watched listing alone', () => {
    addListing('watched');
    db.prepare(`INSERT INTO watch_list (id, listing_id, user_id) VALUES (?,?,?)`).run('w1', 'watched', 'u1');

    expect(listingsStorage.deleteUntouchedListingsById(['watched']).changes).toBe(0);
  });

  it('leaves a listing with documents attached alone', () => {
    addListing('documented');
    db.prepare(`INSERT INTO listing_attachments (id, listing_id) VALUES (?,?)`).run('a1', 'documented');

    expect(listingsStorage.deleteUntouchedListingsById(['documented']).changes).toBe(0);
  });

  it('does not count a listing that was already deleted', () => {
    addListing('gone', { manually_deleted: 1 });

    expect(listingsStorage.deleteUntouchedListingsById(['gone']).changes).toBe(0);
  });

  it('touches nothing outside the ids it was given', () => {
    addListing('asked');
    addListing('bystander');

    listingsStorage.deleteUntouchedListingsById(['asked']);

    expect(deletedIds()).toEqual(['asked']);
  });

  it('does nothing for an empty list', () => {
    expect(listingsStorage.deleteUntouchedListingsById([])).toBeUndefined();
  });
});
