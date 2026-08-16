/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params = {}) => db.prepare(sql).all(params),
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    withTransaction: (cb) => db.transaction(() => cb(db))(),
  },
}));

/**
 * The point of hydration is that everything downstream of jobStorage - notify.js, the pipeline,
 * the tracker - keeps seeing the shape it always saw. These tests assert exactly that.
 */
describe('jobStorage notification adapter hydration', () => {
  let jobStorage;
  let channelStorage;
  let channelId;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY, user_id TEXT, enabled INTEGER, name TEXT, blacklist TEXT, provider TEXT,
        notification_adapter TEXT, shared_with_user TEXT, spatial_filter TEXT, spec_filter TEXT, commute_filter TEXT,
        deal_type TEXT, last_run_at INTEGER
      );
      CREATE TABLE listings (id TEXT PRIMARY KEY, job_id TEXT, is_active INTEGER, manually_deleted INTEGER);
      CREATE TABLE configured_adapter (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, adapter_id TEXT NOT NULL, name TEXT NOT NULL,
        fields TEXT NOT NULL DEFAULT '{}', visibility TEXT NOT NULL DEFAULT 'private',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
    `);
    channelStorage = await import('../../lib/services/storage/configuredAdapterStorage.js');
    jobStorage = await import('../../lib/services/storage/jobStorage.js');

    channelId = channelStorage.upsertChannel({
      userId: 'u1',
      adapterId: 'telegram',
      name: 'Family chat',
      fields: { token: 'tok', chatId: '123' },
    });
  });

  afterEach(() => db.close());

  const addJob = (id, refs) =>
    jobStorage.upsertJob({
      jobId: id,
      userId: 'u1',
      name: `job ${id}`,
      provider: [],
      notificationAdapter: refs,
      enabled: true,
    });

  it('resolves a reference into the shape notify.js expects', () => {
    addJob('j1', [{ configuredAdapterId: channelId }]);

    const adapters = jobStorage.getJob('j1').notificationAdapter;
    expect(adapters).toEqual([
      { id: 'telegram', name: 'Family chat', fields: { token: 'tok', chatId: '123' }, configuredAdapterId: channelId },
    ]);
  });

  it('hydrates on getJobs and queryJobs too', () => {
    addJob('j1', [{ configuredAdapterId: channelId }]);

    expect(jobStorage.getJobs({ includeDisabled: true })[0].notificationAdapter[0].id).toBe('telegram');
    expect(jobStorage.queryJobs({ userId: 'u1' }).result[0].notificationAdapter[0].id).toBe('telegram');
  });

  it('shows the same channel to two jobs, and follows an edit', () => {
    addJob('j1', [{ configuredAdapterId: channelId }]);
    addJob('j2', [{ configuredAdapterId: channelId }]);

    channelStorage.upsertChannel({
      id: channelId,
      userId: 'u1',
      adapterId: 'telegram',
      name: 'Family chat',
      fields: { token: 'rotated', chatId: '123' },
    });

    for (const jobId of ['j1', 'j2']) {
      expect(jobStorage.getJob(jobId).notificationAdapter[0].fields.token).toBe('rotated');
    }
  });

  it('drops a reference whose channel was deleted instead of returning a hole', () => {
    addJob('j1', [{ configuredAdapterId: channelId }, { configuredAdapterId: 'gone' }]);
    expect(jobStorage.getJob('j1').notificationAdapter).toHaveLength(1);
  });

  it('lets one job hold two channels of the same adapter type', () => {
    const second = channelStorage.upsertChannel({
      userId: 'u1',
      adapterId: 'telegram',
      name: 'Work chat',
      fields: { token: 'tok', chatId: '999' },
    });
    addJob('j1', [{ configuredAdapterId: channelId }, { configuredAdapterId: second }]);

    const adapters = jobStorage.getJob('j1').notificationAdapter;
    expect(adapters).toHaveLength(2);
    expect(adapters.map((a) => a.id)).toEqual(['telegram', 'telegram']);
    expect(adapters.map((a) => a.name).sort()).toEqual(['Family chat', 'Work chat']);
  });

  it('returns an empty list for a job with no channels', () => {
    addJob('j1', []);
    expect(jobStorage.getJob('j1').notificationAdapter).toEqual([]);
  });

  it('stores exactly the references it was handed', () => {
    addJob('j1', [{ configuredAdapterId: channelId }]);
    const stored = db.prepare(`SELECT notification_adapter FROM jobs WHERE id = 'j1'`).get().notification_adapter;
    expect(JSON.parse(stored)).toEqual([{ configuredAdapterId: channelId }]);
  });

  /**
   * `upsertJob` always serialises `notificationAdapter` into a valid JSON array, so these shapes
   * can only reach the column some other way (hand edit, a future writer, corruption). We write
   * them straight into the table with a prepared statement to simulate that, bypassing `upsertJob`
   * entirely.
   */
  describe('malformed notification_adapter column', () => {
    const insertRawJob = (id, notificationAdapterRaw) =>
      db
        .prepare(
          `INSERT INTO jobs (id, user_id, enabled, name, blacklist, provider, notification_adapter, shared_with_user, spatial_filter, spec_filter, deal_type, last_run_at)
           VALUES (@id, @userId, 1, @name, '[]', '[]', @notificationAdapter, '[]', NULL, NULL, 'rent', NULL)`,
        )
        .run({ id, userId: 'u1', name: `job ${id}`, notificationAdapter: notificationAdapterRaw });

    it.each([
      ['a JSON object', '{}'],
      ['an object that looks like a single reference', '{"configuredAdapterId":"c1"}'],
      ['a JSON string', '"a string"'],
      ['a JSON number', '123'],
      ['invalid JSON', '{not json'],
    ])('does not throw on %s, and hydrates to an empty list', (_label, raw) => {
      insertRawJob('bad', raw);
      expect(() => jobStorage.getJob('bad')).not.toThrow();
      expect(jobStorage.getJob('bad').notificationAdapter).toEqual([]);
    });

    it('keeps the valid reference in a mixed array alongside null and a bare string', () => {
      insertRawJob('mixed', JSON.stringify([null, 'not-a-ref', { configuredAdapterId: channelId }]));

      expect(() => jobStorage.getJob('mixed')).not.toThrow();
      expect(jobStorage.getJob('mixed').notificationAdapter).toEqual([
        {
          id: 'telegram',
          name: 'Family chat',
          fields: { token: 'tok', chatId: '123' },
          configuredAdapterId: channelId,
        },
      ]);
    });

    it('does not let one malformed row take down getJobs for the rest of the batch', () => {
      insertRawJob('bad', '{}');
      addJob('good', [{ configuredAdapterId: channelId }]);

      expect(() => jobStorage.getJobs({ includeDisabled: true })).not.toThrow();
      const jobs = jobStorage.getJobs({ includeDisabled: true });
      expect(jobs.find((j) => j.id === 'bad').notificationAdapter).toEqual([]);
      expect(jobs.find((j) => j.id === 'good').notificationAdapter[0].id).toBe('telegram');
    });

    it('does not let one malformed row take down queryJobs for the rest of the batch', () => {
      insertRawJob('bad', '{}');
      addJob('good', [{ configuredAdapterId: channelId }]);

      expect(() => jobStorage.queryJobs({ userId: 'u1' })).not.toThrow();
      const { result } = jobStorage.queryJobs({ userId: 'u1' });
      expect(result.find((j) => j.id === 'bad').notificationAdapter).toEqual([]);
      expect(result.find((j) => j.id === 'good').notificationAdapter[0].id).toBe('telegram');
    });
  });
});
