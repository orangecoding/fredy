/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const jobStoragePath = root + '/lib/services/storage/jobStorage.js';
const settingsStoragePath = root + '/lib/services/storage/settingsStorage.js';
const listingsStoragePath = root + '/lib/services/storage/listingsStorage.js';
const notifyPath = root + '/lib/notification/notify.js';
const loggerPath = root + '/lib/services/logger.js';

let state;

async function loadCron() {
  vi.resetModules();
  vi.doMock(jobStoragePath, () => ({
    getJobs: () => {
      if (state.throwOnJobs) throw new Error('jobs table gone');
      return state.jobs;
    },
  }));
  vi.doMock(settingsStoragePath, () => ({
    getSettings: async () => ({ baseUrl: 'http://fredy:9998' }),
    getUserSettings: () => ({ language: state.language }),
  }));
  vi.doMock(listingsStoragePath, () => ({
    getUnenrichedListingsForCatchup: (jobId, options) => {
      state.selections.push({ jobId, options });
      if (state.throwOnSelect) throw new Error('database is locked');
      return state.rows[jobId] ?? [];
    },
    stampEnrichmentRequested: (ids) => {
      state.stamped.push(ids);
      return ids.length;
    },
  }));
  vi.doMock(notifyPath, () => ({
    send: (...args) => {
      state.sends.push(args);
      if (state.failSend) throw new Error('backend is down');
      return [Promise.resolve({ ok: true })];
    },
  }));
  vi.doMock(loggerPath, () => ({
    default: {
      debug: () => {},
      info: (...args) => state.logs.info.push(args.join(' ')),
      warn: (...args) => state.logs.warn.push(args.join(' ')),
      error: () => {},
    },
  }));
  vi.doMock('node-cron', () => ({
    default: {
      schedule: (expression, handler) => {
        state.scheduled.push({ expression, handler });
      },
    },
  }));
  return import(root + '/lib/services/crons/enrichment-catchup-cron.js');
}

/**
 * Hourly enrichment catch-up: rows that missed scoring (webhook throw, restart mid-task,
 * a 401 deploy window) are re-sent through each job's own adapters, grouped by provider
 * exactly like a pipeline run. Bounded: priced rows only, at most twice ever, stamped
 * solely on HTTP success.
 */
describe('services/crons/enrichment-catchup-cron', () => {
  beforeEach(() => {
    state = {
      scheduled: [],
      sends: [],
      stamped: [],
      selections: [],
      logs: { info: [], warn: [] },
      language: 'de',
      failSend: false,
      throwOnSelect: false,
      jobs: [
        { id: 'job-1', userId: 'user-1', notificationAdapter: [{ id: 'http', fields: {} }] },
        { id: 'job-2', userId: 'user-1', notificationAdapter: [] },
      ],
      rows: {
        'job-1': [
          {
            id: 'a',
            hash: 'h-a',
            link: 'https://x.example/a',
            title: 'A',
            price: 100000,
            size: 50,
            rooms: 2,
            address: 'A 1',
            description: 'd',
            image_url: null,
            provider: 'immoscout',
          },
          {
            id: 'b',
            hash: 'h-b',
            link: 'https://x.example/b',
            title: 'B',
            price: 200000,
            size: 60,
            rooms: 3,
            address: 'B 2',
            description: 'e',
            image_url: null,
            provider: 'immowelt',
          },
        ],
      },
    };
  });

  it('schedules hourly at half past and runs once on start', async () => {
    const { initEnrichmentCatchupCron } = await loadCron();

    await initEnrichmentCatchupCron();

    expect(state.scheduled).toHaveLength(1);
    expect(state.scheduled[0].expression).toBe('30 * * * *');
    // One run on start: two provider groups sent, both stamped.
    expect(state.sends).toHaveLength(2);
    expect(state.stamped).toEqual([['a'], ['b']]);
  });

  it('sends per provider with the owner language and the job config', async () => {
    const { runEnrichmentCatchup } = await loadCron();

    const summary = await runEnrichmentCatchup({ now: 1000 });

    expect(summary).toEqual({ jobs: 1, requested: 2, failed: 0 });
    const [serviceName, formatted, config, jobKey, baseUrl] = state.sends[0];
    expect(serviceName).toBe('immoscout');
    expect(jobKey).toBe('job-1');
    expect(baseUrl).toBe('http://fredy:9998');
    expect(config).toEqual([{ id: 'http', fields: {} }]);
    // Same display strings the pipeline sends: the backend parses German number formats.
    expect(formatted[0].price).toBe('100000 €');
    expect(formatted[0].rooms).toBe('2 Zimmer');
    // The job without adapters is skipped, not stamped, not counted.
    expect(state.selections.map((s) => s.jobId)).toEqual(['job-1']);
  });

  it('does not stamp when the send throws, and never throws itself', async () => {
    state.failSend = true;
    const { runEnrichmentCatchup } = await loadCron();

    const summary = await runEnrichmentCatchup({ now: 1000 });

    expect(summary).toEqual({ jobs: 1, requested: 0, failed: 2 });
    expect(state.stamped).toEqual([]);
    expect(state.logs.warn.length).toBeGreaterThan(0);
  });

  it('survives a job listing failure', async () => {
    state.throwOnJobs = true;
    const { runEnrichmentCatchup } = await loadCron();

    await expect(runEnrichmentCatchup({ now: 1000 })).resolves.toEqual({ jobs: 0, requested: 0, failed: 0 });
  });
});
