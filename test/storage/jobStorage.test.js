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

  it('selects the deal type on every read path', () => {
    jobStorage.getJobs();
    jobStorage.getJob('job-1');
    jobStorage.queryJobs({ userId: 'u1' });
    // Every query that projects job columns (not the bare COUNT) must carry the deal type.
    for (const call of calls.query) {
      if (call.sql.includes('j.notification_adapter')) {
        expect(call.sql).toContain('j.deal_type AS dealType');
      }
    }
  });
});

describe('jobStorage.upsertJob deal type', () => {
  let jobStorage;

  beforeEach(async () => {
    calls.execute.length = 0;
    calls.query.length = 0;
    sqliteMock.__queryHandler = null;
    jobStorage = await import('../../lib/services/storage/jobStorage.js');
  });

  it('persists the given deal type on insert', () => {
    // No existing row, so this is an INSERT.
    jobStorage.upsertJob({ userId: 'u1', name: 'Buy job', provider: [], notificationAdapter: [], dealType: 'buy' });
    const insert = calls.execute.find((c) => c.sql.includes('INSERT INTO jobs'));
    expect(insert.sql).toContain('deal_type');
    expect(insert.params.dealType).toBe('buy');
  });

  it('defaults an insert to renting when no deal type is given', () => {
    jobStorage.upsertJob({ userId: 'u1', name: 'Job', provider: [], notificationAdapter: [] });
    const insert = calls.execute.find((c) => c.sql.includes('INSERT INTO jobs'));
    expect(insert.params.dealType).toBe('rent');
  });

  it('keeps the stored deal type on an update that omits it', () => {
    // An existing row -> UPDATE path.
    sqliteMock.__queryHandler = (sql) => (sql.includes('SELECT id, user_id') ? [{ id: 'job-1', user_id: 'u1' }] : []);
    jobStorage.upsertJob({ jobId: 'job-1', name: 'Job', provider: [], notificationAdapter: [] });
    const update = calls.execute.find((c) => c.sql.includes('UPDATE jobs'));
    // COALESCE leaves the column untouched when the bound value is null.
    expect(update.sql).toContain('deal_type = COALESCE(@dealType, deal_type)');
    expect(update.params.dealType).toBeNull();
  });

  it('applies an explicit deal type on update', () => {
    sqliteMock.__queryHandler = (sql) => (sql.includes('SELECT id, user_id') ? [{ id: 'job-1', user_id: 'u1' }] : []);
    jobStorage.upsertJob({ jobId: 'job-1', name: 'Job', provider: [], notificationAdapter: [], dealType: 'rent' });
    const update = calls.execute.find((c) => c.sql.includes('UPDATE jobs'));
    expect(update.params.dealType).toBe('rent');
  });
});
