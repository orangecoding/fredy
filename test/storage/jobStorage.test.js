/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock SqliteConnection so we can assert which SQL the storage layer runs
// without spinning up a real SQLite DB.

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
  __queryHandler: null,
};

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: sqliteMock,
}));

describe('jobStorage.getJobs', () => {
  let jobStorage;

  beforeEach(async () => {
    calls.execute.length = 0;
    calls.query.length = 0;
    sqliteMock.__queryHandler = null;
    jobStorage = await import('../../lib/services/storage/jobStorage.js');
  });

  it('filters out disabled jobs by default (WHERE j.enabled = 1)', () => {
    jobStorage.getJobs();
    expect(calls.query).toHaveLength(1);
    expect(calls.query[0].sql).toMatch(/WHERE j\.enabled = 1/);
  });

  it('includes disabled jobs when includeDisabled is true', () => {
    jobStorage.getJobs({ includeDisabled: true });
    expect(calls.query).toHaveLength(1);
    expect(calls.query[0].sql).not.toMatch(/WHERE j\.enabled = 1/);
  });

  it('coerces the enabled column to a boolean', () => {
    sqliteMock.__queryHandler = () => [
      { id: 'enabled-job', enabled: 1 },
      { id: 'disabled-job', enabled: 0 },
    ];
    const jobs = jobStorage.getJobs({ includeDisabled: true });
    expect(jobs.find((j) => j.id === 'enabled-job').enabled).toBe(true);
    expect(jobs.find((j) => j.id === 'disabled-job').enabled).toBe(false);
  });
});
