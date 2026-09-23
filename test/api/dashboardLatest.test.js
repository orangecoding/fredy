/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The two reads behind the dashboard's "what came in" panels. Both interpolate their own LIMIT and
 * both cut day buckets in local time, so they run against a real in-memory database here: the
 * clamping and the date arithmetic are the parts that break silently.
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

/** Midday, so shifting by whole days never crosses a boundary by accident. */
const NOW = new Date('2026-07-25T12:00:00').getTime();

/** Epoch ms for `offset` days before NOW, at midday. */
const daysAgo = (offset) => {
  const date = new Date(NOW);
  date.setDate(date.getDate() - offset);
  return date.getTime();
};

describe('the dashboard listing reads', () => {
  let listingsStorage;
  let addListing;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        title TEXT,
        address TEXT,
        price REAL,
        size REAL,
        rooms REAL,
        price_per_sqm REAL,
        image_url TEXT,
        created_at INTEGER,
        manually_deleted INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1
      );
    `);
    const insert = db.prepare(
      `INSERT INTO listings (id, job_id, title, address, price, size, rooms, price_per_sqm, image_url,
                             created_at, manually_deleted, is_active)
       VALUES (@id, @jobId, @title, @address, @price, @size, @rooms, @pricePerSqm, @imageUrl,
               @createdAt, @manuallyDeleted, @isActive)`,
    );
    let seq = 0;
    addListing = ({ jobId = 'job-1', createdAt = NOW, manuallyDeleted = 0, isActive = 1, title = null } = {}) => {
      const id = `l${seq++}`;
      insert.run({
        id,
        jobId,
        title: title ?? id,
        address: 'Somewhere 1',
        price: 900,
        size: 60,
        rooms: 2,
        pricePerSqm: 15,
        imageUrl: null,
        createdAt,
        manuallyDeleted,
        isActive,
      });
      return id;
    };

    vi.resetModules();
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  describe('getLatestListingsForJobIds', () => {
    const latest = (jobIds, limit) => listingsStorage.getLatestListingsForJobIds(jobIds, limit);

    it('returns the newest first, because the panel answers "what came in"', () => {
      const oldest = addListing({ createdAt: daysAgo(5) });
      const middle = addListing({ createdAt: daysAgo(2) });
      const newest = addListing({ createdAt: daysAgo(0) });

      expect(latest(['job-1']).map((row) => row.id)).toEqual([newest, middle, oldest]);
    });

    it('leaves out an inactive listing, which is already gone', () => {
      const active = addListing({ createdAt: daysAgo(3) });
      addListing({ createdAt: daysAgo(1), isActive: 0 });

      expect(latest(['job-1']).map((row) => row.id)).toEqual([active]);
    });

    it('leaves out a soft-deleted listing, which the user no longer sees', () => {
      const kept = addListing({ createdAt: daysAgo(3) });
      addListing({ createdAt: daysAgo(1), manuallyDeleted: 1 });

      expect(latest(['job-1']).map((row) => row.id)).toEqual([kept]);
    });

    it('reads only the jobs it was given', () => {
      const mine = addListing({ jobId: 'job-1' });
      addListing({ jobId: 'other' });

      expect(latest(['job-1']).map((row) => row.id)).toEqual([mine]);
    });

    it('returns nothing without querying when there is no job to read', () => {
      addListing({});
      expect(latest([])).toEqual([]);
      expect(latest(null)).toEqual([]);
    });

    it('honours a limit inside the allowed range', () => {
      for (let i = 0; i < 5; i++) {
        addListing({ createdAt: daysAgo(i) });
      }
      expect(latest(['job-1'], 3)).toHaveLength(3);
    });

    it('falls back to eight for a limit that is not a whole number in range', () => {
      for (let i = 0; i < 12; i++) {
        addListing({ createdAt: daysAgo(i) });
      }
      for (const limit of [0, -1, 999, '8', 8.5, null, undefined, NaN]) {
        expect(latest(['job-1'], limit), `limit ${String(limit)}`).toHaveLength(8);
      }
    });

    it('carries the columns the panel renders', () => {
      addListing({ title: 'Altbau mit Balkon' });
      const [row] = latest(['job-1']);

      expect(Object.keys(row).sort()).toEqual(
        [
          'address',
          'created_at',
          'id',
          'image_url',
          'job_id',
          'price',
          'price_per_sqm',
          'rooms',
          'size',
          'title',
        ].sort(),
      );
      expect(row.title).toBe('Altbau mit Balkon');
    });
  });

  describe('getListingActivityPerJob', () => {
    const activity = (jobIds, days) => listingsStorage.getListingActivityPerJob(jobIds, days, NOW);

    it('gives a job that found nothing a full series of zeroes rather than no row at all', () => {
      const result = activity(['quiet-job']);

      expect(result['quiet-job']).toEqual({ perDay: [0, 0, 0, 0, 0, 0, 0], total: 0 });
    });

    it('reports exactly seven days, the last of them today', () => {
      addListing({ createdAt: daysAgo(0) });
      addListing({ createdAt: daysAgo(6) });
      addListing({ createdAt: daysAgo(7) });

      const { perDay, total } = activity(['job-1'])['job-1'];

      expect(perDay).toHaveLength(7);
      expect(perDay.at(-1)).toBe(1);
      expect(perDay[0]).toBe(1);
      expect(total).toBe(2);
    });

    it('counts each job on its own', () => {
      addListing({ jobId: 'job-1', createdAt: daysAgo(0) });
      addListing({ jobId: 'job-1', createdAt: daysAgo(0) });
      addListing({ jobId: 'job-2', createdAt: daysAgo(1) });
      addListing({ jobId: 'not-asked-for', createdAt: daysAgo(1) });

      const result = activity(['job-1', 'job-2']);

      expect(Object.keys(result).sort()).toEqual(['job-1', 'job-2']);
      expect(result['job-1'].perDay.at(-1)).toBe(2);
      expect(result['job-2'].perDay.at(-2)).toBe(1);
      expect(result['job-1'].total).toBe(2);
    });

    it('ignores soft-deleted listings', () => {
      addListing({ createdAt: daysAgo(1) });
      addListing({ createdAt: daysAgo(1), manuallyDeleted: 1 });

      expect(activity(['job-1'])['job-1'].total).toBe(1);
    });

    it('returns nothing without querying when there is no job to read', () => {
      addListing({});
      expect(activity([])).toEqual({});
      expect(activity(null)).toEqual({});
    });

    it('honours a different span and falls back to seven for a nonsensical one', () => {
      expect(activity(['job-1'], 14)['job-1'].perDay).toHaveLength(14);
      expect(activity(['job-1'], 0)['job-1'].perDay).toHaveLength(7);
      expect(activity(['job-1'], -3)['job-1'].perDay).toHaveLength(7);
    });
  });
});
