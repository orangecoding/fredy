/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// We mock SqliteConnection so we can assert which SQL the storage layer
// runs and with which params, without spinning up a real SQLite DB.

const calls = {
  execute: [],
  query: [],
};

const sqliteMock = {
  execute: (sql, params) => {
    calls.execute.push({ sql, params });
    // Default: pretend 1 row was affected (so setListingStatus reports success).
    return { changes: 1 };
  },
  query: (sql, params) => {
    calls.query.push({ sql, params });
    // Return shape varies by test — overridden via queryHandler when needed.
    if (sqliteMock.__queryHandler) return sqliteMock.__queryHandler(sql, params);
    return [];
  },
  __queryHandler: null,
};

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: sqliteMock,
}));

describe('listingsStorage.setListingStatus', () => {
  let listingsStorage;

  beforeEach(async () => {
    calls.execute.length = 0;
    calls.query.length = 0;
    sqliteMock.__queryHandler = null;
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  it('runs an UPDATE storing a JSON payload with status and setAt', () => {
    const before = Date.now();
    const changes = listingsStorage.setListingStatus('listing-1', 'Applied');
    const after = Date.now();
    expect(changes).toBe(1);
    expect(calls.execute).toHaveLength(1);
    expect(calls.execute[0].sql).toMatch(/UPDATE listings SET status = @status WHERE id = @id/);
    expect(calls.execute[0].params.id).toBe('listing-1');
    const parsed = JSON.parse(calls.execute[0].params.status);
    expect(parsed.status).toBe('applied');
    expect(parsed.setAt).toBeGreaterThanOrEqual(before);
    expect(parsed.setAt).toBeLessThanOrEqual(after);
  });

  it('accepts null to clear the status (no JSON wrapping)', () => {
    listingsStorage.setListingStatus('listing-2', null);
    expect(calls.execute[0].params).toEqual({ id: 'listing-2', status: null });
  });

  it('rejects invalid statuses', () => {
    expect(() => listingsStorage.setListingStatus('listing-3', 'maybe')).toThrow(/Invalid listing status/);
    expect(calls.execute).toHaveLength(0);
  });

  it('returns 0 when no id is supplied (no SQL is run)', () => {
    const result = listingsStorage.setListingStatus(null, 'applied');
    expect(result).toBe(0);
    expect(calls.execute).toHaveLength(0);
  });
});

describe('listingsStorage.queryListings statusFilter', () => {
  let listingsStorage;

  beforeEach(async () => {
    calls.execute.length = 0;
    calls.query.length = 0;
    // Return empty rows for both the count and the page-fetch queries.
    sqliteMock.__queryHandler = (sql) => {
      if (/COUNT\(1\)/.test(sql)) return [{ cnt: 0 }];
      return [];
    };
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  it("adds 'l.status IS NULL' to WHERE when statusFilter is 'none'", () => {
    listingsStorage.queryListings({ statusFilter: 'none', userId: 'u1', isAdmin: true });
    const pageQuery = calls.query.find((c) => !/COUNT\(1\)/.test(c.sql));
    expect(pageQuery.sql).toMatch(/\(l\.status IS NULL\)/);
  });

  it('extracts the inner status field via json_extract for a concrete status', () => {
    listingsStorage.queryListings({ statusFilter: 'applied', userId: 'u1', isAdmin: true });
    const pageQuery = calls.query.find((c) => !/COUNT\(1\)/.test(c.sql));
    expect(pageQuery.sql).toMatch(/json_extract\(l\.status, '\$\.status'\) = @statusValue/);
    expect(pageQuery.params.statusValue).toBe('applied');
  });

  it('ignores unknown statusFilter values silently', () => {
    listingsStorage.queryListings({ statusFilter: 'bogus', userId: 'u1', isAdmin: true });
    const pageQuery = calls.query.find((c) => !/COUNT\(1\)/.test(c.sql));
    expect(pageQuery.sql).not.toMatch(/status/i);
  });

  it('parses the JSON status payload of returned rows into an object', () => {
    sqliteMock.__queryHandler = (sql) => {
      if (/COUNT\(1\)/.test(sql)) return [{ cnt: 2 }];
      return [
        { id: 'a', status: JSON.stringify({ status: 'applied', setAt: 1700000000000 }) },
        { id: 'b', status: null },
      ];
    };
    const result = listingsStorage.queryListings({ userId: 'u1', isAdmin: true });
    expect(result.result[0].status).toEqual({ status: 'applied', setAt: 1700000000000 });
    expect(result.result[1].status).toBeNull();
  });
});

describe('listingsStorage.getListingById', () => {
  let listingsStorage;

  beforeEach(async () => {
    calls.execute.length = 0;
    calls.query.length = 0;
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  it('parses the JSON status payload of the returned row', () => {
    sqliteMock.__queryHandler = () => [
      { id: 'a', status: JSON.stringify({ status: 'rejected', setAt: 1700000000001 }) },
    ];
    const row = listingsStorage.getListingById('a', 'u1', true);
    expect(row.status).toEqual({ status: 'rejected', setAt: 1700000000001 });
  });

  it('returns null status untouched', () => {
    sqliteMock.__queryHandler = () => [{ id: 'a', status: null }];
    const row = listingsStorage.getListingById('a', 'u1', true);
    expect(row.status).toBeNull();
  });

  it('returns null when no row is found', () => {
    sqliteMock.__queryHandler = () => [];
    const row = listingsStorage.getListingById('missing', 'u1', true);
    expect(row).toBeNull();
  });
});

describe('watchListStorage.ensureWatch', () => {
  let watchListStorage;

  beforeEach(async () => {
    calls.execute.length = 0;
    calls.query.length = 0;
    sqliteMock.__queryHandler = null;
    watchListStorage = await import('../../lib/services/storage/watchListStorage.js');
  });

  it('inserts and reports watched=true on first call', () => {
    // After INSERT, createWatch queries for existence and gets a row back.
    sqliteMock.__queryHandler = () => [{ ok: 1 }];
    const result = watchListStorage.ensureWatch('listing-1', 'user-1');
    expect(result).toEqual({ watched: true });
    // INSERT should have been issued.
    expect(calls.execute.some((c) => /INSERT INTO watch_list/.test(c.sql))).toBe(true);
  });

  it('returns watched=true when an entry already exists', () => {
    // Simulate ON CONFLICT being a no-op: execute reports no changes, then SELECT confirms row exists.
    sqliteMock.execute = (sql, params) => {
      calls.execute.push({ sql, params });
      return { changes: 0 };
    };
    sqliteMock.__queryHandler = () => [{ ok: 1 }];
    const result = watchListStorage.ensureWatch('listing-2', 'user-2');
    expect(result).toEqual({ watched: true });
    // Restore execute to default for subsequent tests.
    sqliteMock.execute = (sql, params) => {
      calls.execute.push({ sql, params });
      return { changes: 1 };
    };
  });

  it('returns watched=false when listingId or userId is missing', () => {
    expect(watchListStorage.ensureWatch(null, 'u')).toEqual({ watched: false });
    expect(watchListStorage.ensureWatch('l', null)).toEqual({ watched: false });
    expect(calls.execute).toHaveLength(0);
  });
});
