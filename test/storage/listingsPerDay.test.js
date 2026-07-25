/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The dashboard trend is drawn straight from this series, so a missing day or an off-by-one at a
 * bucket boundary shows up as a wrong shape rather than an error. Run against a real in-memory
 * database so the date arithmetic is exercised alongside the SQL.
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

describe('getListingsPerDayForJobIds', () => {
  let listingsStorage;
  let addListing;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        created_at INTEGER,
        manually_deleted INTEGER DEFAULT 0
      );
    `);
    const insert = db.prepare(`INSERT INTO listings (id, job_id, created_at, manually_deleted) VALUES (?, ?, ?, ?)`);
    let seq = 0;
    addListing = (jobId, createdAt, deleted = 0) => insert.run(`l${seq++}`, jobId, createdAt, deleted);

    vi.resetModules();
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  const series = (jobIds, days = 14) => listingsStorage.getListingsPerDayForJobIds(jobIds, days, NOW);

  it('returns one entry per day, oldest first, including today', () => {
    const result = series(['job-1']);
    expect(result).toHaveLength(14);
    expect(result[13].date).toBe('2026-07-25');
    expect(result[0].date).toBe('2026-07-12');
  });

  it('returns a full series of zeroes when there are no listings', () => {
    const result = series(['job-1']);
    expect(result.every((row) => row.count === 0)).toBe(true);
  });

  it('returns a full series of zeroes when there are no jobs, without querying', () => {
    const result = series([]);
    expect(result).toHaveLength(14);
    expect(result.every((row) => row.count === 0)).toBe(true);
  });

  it('counts listings into the day they were created', () => {
    addListing('job-1', daysAgo(0));
    addListing('job-1', daysAgo(0));
    addListing('job-1', daysAgo(3));
    const result = series(['job-1']);

    expect(result.at(-1)).toEqual({ date: '2026-07-25', count: 2 });
    expect(result.at(-4)).toEqual({ date: '2026-07-22', count: 1 });
  });

  it('ignores listings of other jobs', () => {
    addListing('job-1', daysAgo(1));
    addListing('other', daysAgo(1));
    const result = series(['job-1']);
    expect(result.at(-2).count).toBe(1);
  });

  it('ignores soft-deleted listings, which the user no longer sees', () => {
    addListing('job-1', daysAgo(1));
    addListing('job-1', daysAgo(1), 1);
    expect(series(['job-1']).at(-2).count).toBe(1);
  });

  it('excludes anything older than the window rather than piling it onto the first day', () => {
    addListing('job-1', daysAgo(20));
    addListing('job-1', daysAgo(13));
    const result = series(['job-1']);

    expect(result[0].count).toBe(1); // the 13-day-old one, which is the first day in range
    expect(result.reduce((sum, row) => sum + row.count, 0)).toBe(1);
  });

  it('honours a shorter window', () => {
    const result = series(['job-1'], 7);
    expect(result).toHaveLength(7);
    expect(result[0].date).toBe('2026-07-19');
  });

  it('falls back to the default window for a nonsensical day count', () => {
    expect(series(['job-1'], 0)).toHaveLength(14);
    expect(series(['job-1'], -3)).toHaveLength(14);
  });
});
