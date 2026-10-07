/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Same SqliteConnection mock shape as deleteListings.test.js: record SQL + params,
// drive rows through a handler.
const calls = {
  execute: [],
  query: [],
};

const sqliteMock = {
  execute: (sql, params) => {
    calls.execute.push({ sql, params });
    return { changes: 1 };
  },
  query: (sql, params) => {
    calls.query.push({ sql, params });
    if (sqliteMock.__queryHandler) return sqliteMock.__queryHandler(sql, params);
    return [];
  },
  withTransaction: (callback) =>
    callback({
      prepare: (sql) => ({
        run: (params) => {
          calls.execute.push({ sql, params });
          return { changes: 1 };
        },
        all: (params) => {
          calls.query.push({ sql, params });
          if (sqliteMock.__queryHandler) return sqliteMock.__queryHandler(sql, params);
          return [];
        },
      }),
    }),
  __queryHandler: null,
};

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: sqliteMock,
}));

const removeEntry = vi.fn();
vi.mock('../../lib/services/similarity-check/similarityCache.js', () => ({
  removeEntry: (...args) => removeEntry(...args),
}));

/**
 * One row, many jobs: listings attach to every job whose search returned them (matched by
 * exact URL) instead of duplicating. These pin the storage contract beneath that behavior.
 */
describe('listingsStorage cross-job attachments', () => {
  let listingsStorage;

  beforeEach(async () => {
    calls.execute.length = 0;
    calls.query.length = 0;
    sqliteMock.__queryHandler = null;
    removeEntry.mockClear();
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  describe('findListingsByLinks', () => {
    it('matches byte-identical links within the owner jobs, without normalizing', () => {
      sqliteMock.__queryHandler = () => [
        { id: 'row-1', job_id: 'job-a', provider: 'immoscout', link: 'https://x.example/1' },
      ];

      const rows = listingsStorage.findListingsByLinks(['https://x.example/1', 'https://x.example/1/'], 'user-1');

      expect(rows).toHaveLength(1);
      const { sql, params } = calls.query[0];
      // Exact IN match on the raw strings - no LOWER(), no trimming, no normalization.
      expect(sql).toContain('l.link IN');
      expect(sql).not.toMatch(/LOWER|TRIM/i);
      expect(sql).toContain('j.user_id = @ownerUserId');
      expect(params.ownerUserId).toBe('user-1');
      expect(params.link0).toBe('https://x.example/1');
      expect(params.link1).toBe('https://x.example/1/');
    });

    it('is a no-op without links or without an owner', () => {
      expect(listingsStorage.findListingsByLinks([], 'user-1')).toEqual([]);
      expect(listingsStorage.findListingsByLinks(['https://x.example/1'], null)).toEqual([]);
      expect(calls.query).toHaveLength(0);
    });
  });

  describe('attachJobsToListing', () => {
    it('inserts idempotently and reports new attachments', () => {
      const added = listingsStorage.attachJobsToListing('row-1', ['job-b', 'job-b', 'job-c'], 1234);

      expect(added).toBe(2);
      const [first, second] = calls.execute;
      expect(first.sql).toMatch(/INSERT OR IGNORE INTO listing_jobs/);
      expect(first.params).toMatchObject({ listing_id: 'row-1', job_id: 'job-b', attached_at: 1234 });
      expect(second.params).toMatchObject({ listing_id: 'row-1', job_id: 'job-c' });
    });

    it('is a no-op without a listing or jobs', () => {
      expect(listingsStorage.attachJobsToListing(null, ['job-b'])).toBe(0);
      expect(listingsStorage.attachJobsToListing('row-1', [])).toBe(0);
      expect(calls.execute).toHaveLength(0);
    });
  });

  describe('getJobIdsForListing', () => {
    it('returns the primary job first, then attachments, deduplicated', () => {
      sqliteMock.__queryHandler = () => [
        { primary_job: 'job-a', attached_job: 'job-a' },
        { primary_job: 'job-a', attached_job: 'job-b' },
      ];

      expect(listingsStorage.getJobIdsForListing('row-1')).toEqual(['job-a', 'job-b']);
    });

    it('is a no-op without a listing id', () => {
      expect(listingsStorage.getJobIdsForListing(null)).toEqual([]);
      expect(calls.query).toHaveLength(0);
    });
  });

  describe('getKnownListingHashesForJobAndProvider', () => {
    it('counts attached rows as known so re-finds stay quiet', () => {
      sqliteMock.__queryHandler = () => [{ hash: 'h1' }, { hash: 'h1' }];

      const hashes = listingsStorage.getKnownListingHashesForJobAndProvider('job-b', 'immoscout');

      expect(hashes).toEqual(['h1', 'h1']);
      expect(calls.query[0].sql).toContain('listing_jobs');
      expect(calls.query[0].params).toMatchObject({ jobId: 'job-b', providerId: 'immoscout' });
    });
  });

  describe('detachListingsFromJob', () => {
    it('removes the attachments and reports listings left with no job', () => {
      sqliteMock.__queryHandler = () => [{ id: 'orphan-1' }];

      const orphans = listingsStorage.detachListingsFromJob('job-1');

      expect(orphans).toEqual(['orphan-1']);
      expect(calls.execute[0].sql).toMatch(/DELETE FROM listing_jobs WHERE job_id = @jobId/);
      expect(calls.query[0].sql).toContain('NOT EXISTS (SELECT 1 FROM listing_jobs');
    });
  });

  describe('reassignPrimaryListingsFromJob', () => {
    it('hands shared rows to another attached job before the job row goes away', () => {
      const changed = listingsStorage.reassignPrimaryListingsFromJob('job-1');

      expect(changed).toBe(1);
      expect(calls.execute[0].sql).toMatch(/UPDATE listings/);
      expect(calls.execute[0].sql).toContain('ORDER BY lj.attached_at ASC');
    });
  });

  describe('any-job access', () => {
    it('filterListingIdsForUser accepts rows attached to a visible job', () => {
      sqliteMock.__queryHandler = () => [{ id: 'row-1' }];

      const allowed = listingsStorage.filterListingIdsForUser(['row-1'], 'user-1', false);

      expect(allowed).toEqual(['row-1']);
      expect(calls.query[0].sql).toContain('listing_jobs');
    });
  });

  describe('attachJobNames', () => {
    it('adds primary-first job name pairs and keeps the legacy job_name', () => {
      sqliteMock.__queryHandler = () => [
        { listing_id: 'row-1', id: 'job-b', name: 'Second' },
        { listing_id: 'row-1', id: 'job-a', name: 'First' },
      ];

      const [row] = listingsStorage.attachJobNames([{ id: 'row-1', job_id: 'job-a', job_name: 'First' }]);

      expect(row.job_names).toEqual([
        { id: 'job-a', name: 'First' },
        { id: 'job-b', name: 'Second' },
      ]);
      expect(row.job_name).toBe('First');
    });

    it('passes empty input through untouched', () => {
      expect(listingsStorage.attachJobNames([])).toEqual([]);
      expect(calls.query).toHaveLength(0);
    });
  });
});
