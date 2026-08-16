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
    // 2 calls: the jobs query itself, plus the channel lookup that hydrates notificationAdapter.
    expect(calls.query).toHaveLength(2);
    expect(calls.query[0].sql).toMatch(/WHERE j\.enabled = 1/);
  });

  it('includes disabled jobs when includeDisabled is true', () => {
    jobStorage.getJobs({ includeDisabled: true });
    // 2 calls: the jobs query itself, plus the channel lookup that hydrates notificationAdapter.
    expect(calls.query).toHaveLength(2);
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

/**
 * better-sqlite3 accepts a bound parameter the statement never mentions and simply drops it, so the
 * only sign of a column added to the parameter object but forgotten in the INSERT is that the value
 * is not there afterwards. That is how the commute filter of every newly created job was lost while
 * editing an existing one stored it fine, and it is a mistake the next column can make just as
 * easily. Checked as a rule rather than per column so it keeps holding without anyone remembering.
 */
describe('jobStorage.upsertJob binds nothing it does not write', () => {
  let jobStorage;

  beforeEach(async () => {
    calls.execute.length = 0;
    calls.query.length = 0;
    sqliteMock.__queryHandler = null;
    jobStorage = await import('../../lib/services/storage/jobStorage.js');
  });

  const aJob = {
    name: 'Job',
    provider: [],
    notificationAdapter: [],
    spatialFilter: { type: 'FeatureCollection' },
    specFilter: { maxPrice: 1200 },
    commuteFilter: { action: 'notify', limits: { Work: 35 } },
    dealType: 'rent',
  };

  it.each([
    ['insert', null, 'INSERT INTO jobs'],
    ['update', (sql) => (sql.includes('SELECT id, user_id') ? [{ id: 'job-1', user_id: 'u1' }] : []), 'UPDATE jobs'],
  ])('uses every parameter it binds on %s', (_what, queryHandler, statement) => {
    sqliteMock.__queryHandler = queryHandler;
    jobStorage.upsertJob({ ...aJob, jobId: statement.startsWith('UPDATE') ? 'job-1' : undefined, userId: 'u1' });

    const call = calls.execute.find((c) => c.sql.includes(statement));
    const unused = Object.keys(call.params).filter((name) => !call.sql.includes(`@${name}`));
    expect(unused).toEqual([]);
  });

  it('writes the commute filter of a brand new job, not only of an edited one', () => {
    jobStorage.upsertJob({ ...aJob, userId: 'u1' });
    const insert = calls.execute.find((c) => c.sql.includes('INSERT INTO jobs'));
    expect(insert.sql).toContain('commute_filter');
    expect(JSON.parse(insert.params.commuteFilter)).toEqual(aJob.commuteFilter);
  });
});
