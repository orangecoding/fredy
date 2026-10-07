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
    return { changes: 2 };
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
      }),
    }),
  __queryHandler: null,
};

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: sqliteMock,
}));

describe('listingsStorage enrichment catch-up selection', () => {
  let listingsStorage;

  beforeEach(async () => {
    calls.execute.length = 0;
    calls.query.length = 0;
    sqliteMock.__queryHandler = null;
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  it('selects priced, unscored, under-retry rows past the cooldown, active or not', () => {
    sqliteMock.__queryHandler = () => [{ id: 'a', image_files: null, details_fetched: 0, risk_analysis: null }];

    const rows = listingsStorage.getUnenrichedListingsForCatchup('job-1', { now: 1_000_000 });

    expect(rows).toHaveLength(1);
    expect(rows[0].image_files).toBeNull();
    const { sql, params } = calls.query[0];
    expect(sql).toContain('l.job_id = @jobId');
    expect(sql).toContain('l.price IS NOT NULL');
    // No is_active filter: off-market rows keep scores for history and comparisons.
    expect(sql).not.toContain('is_active');
    expect(sql).toContain('l.investor_score IS NULL OR l.investor_score = 0');
    expect(sql).toContain('enrichment_requests < @maxRequests');
    expect(sql).toContain('enrichment_requested_at IS NULL OR');
    // Uncapped by default: scoring is local CPU-only, so the whole backlog is selected.
    expect(sql).not.toContain('LIMIT');
    expect(params).not.toHaveProperty('limit');
    // 24h cooldown: requested_at must be older than now - 86400000.
    expect(params.retryAfter).toBe(1_000_000 - 24 * 60 * 60 * 1000);
  });

  it('still honors an explicit limit', () => {
    sqliteMock.__queryHandler = () => [];

    listingsStorage.getUnenrichedListingsForCatchup('job-1', { limit: 5, now: 1_000_000 });

    const { sql, params } = calls.query[0];
    expect(sql).toContain('LIMIT @limit');
    expect(params).toMatchObject({ limit: 5 });
  });

  it('stamps time and bumps the counter, and no-ops on empty input', () => {
    expect(listingsStorage.stampEnrichmentRequested([], 500)).toBe(0);
    expect(calls.execute).toHaveLength(0);

    const changed = listingsStorage.stampEnrichmentRequested(['a', 'b'], 500);

    expect(changed).toBe(2);
    const { sql, params } = calls.execute[0];
    expect(sql).toContain('enrichment_requested_at = @now');
    expect(sql).toContain('enrichment_requests = COALESCE(enrichment_requests, 0) + 1');
    expect(params).toMatchObject({ now: 500, id0: 'a', id1: 'b' });
  });
});
