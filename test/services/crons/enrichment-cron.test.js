/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const jobStoragePath = root + '/lib/services/storage/jobStorage.js';
const listingsStoragePath = root + '/lib/services/storage/listingsStorage.js';
const enrichListingPath = root + '/lib/services/enrichment/enrichListing.js';
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
  vi.doMock(listingsStoragePath, () => ({
    getUnenrichedListingsForCatchup: (jobId, options) => {
      state.selections.push({ jobId, options });
      return state.rows[jobId] ?? [];
    },
    stampEnrichmentRequested: (ids) => {
      state.stamped.push(ids);
      return ids.length;
    },
  }));
  vi.doMock(enrichListingPath, () => ({
    enrichListing: async (row) => {
      state.enriched.push(row.id);
      return state.enrichBehavior(row);
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
  return import(root + '/lib/services/crons/enrichment-cron.js');
}

/**
 * Local enrichment cron: scores priced, scoreless rows in-process with the JS ports of the
 * old backend pipeline (Mietspiegel + rough commute + GREIX growth + scorer), then stamps
 * them so the webhook catch-up and the next run leave them alone.
 */
describe('services/crons/enrichment-cron', () => {
  beforeEach(() => {
    state = {
      scheduled: [],
      enriched: [],
      stamped: [],
      selections: [],
      logs: { info: [], warn: [] },
      throwOnJobs: false,
      enrichBehavior: () => ({ investorScore: 42, ownerScore: 43 }),
      jobs: [
        { id: 'job-1', userId: 'user-1' },
        { id: 'job-2', userId: 'user-1' },
      ],
      rows: {
        'job-1': [
          { id: 'a', link: 'https://x.example/a', price: 100000, size: 50, latitude: 52.5, longitude: 13.4 },
          { id: 'b', link: 'https://x.example/b', price: 200000, size: 60, latitude: 52.5, longitude: 13.4 },
        ],
        // Same row attached to both jobs: enriched once, stamped once.
        'job-2': [{ id: 'a', link: 'https://x.example/a', price: 100000, size: 50, latitude: 52.5, longitude: 13.4 }],
      },
    };
  });

  it('schedules hourly at quarter to and runs once on start', async () => {
    const { initLocalEnrichmentCron } = await loadCron();

    await initLocalEnrichmentCron();

    expect(state.scheduled).toHaveLength(1);
    expect(state.scheduled[0].expression).toBe('45 * * * *');
    // Two unique rows enriched despite three selections across two jobs.
    expect(state.enriched).toEqual(['a', 'b']);
    expect(state.stamped).toEqual([['a', 'b']]);
  });

  it('enriches every unenriched row of a job and stamps successes', async () => {
    const { runLocalEnrichment } = await loadCron();

    const summary = await runLocalEnrichment({ now: 1000 });

    // One job counted: job-2's only row was already handled under job-1 (shared row dedupe).
    expect(summary).toEqual({ jobs: 1, enriched: 2, failed: 0 });
    // No per-run cap: scoring is local CPU-only, so the whole backlog is selected.
    expect(state.selections[0]).toEqual({ jobId: 'job-1', options: { now: 1000 } });
  });

  it('counts null returns and throws as failed without stamping', async () => {
    state.enrichBehavior = (row) => {
      if (row.id === 'a') return null;
      throw new Error('write failed');
    };
    const { runLocalEnrichment } = await loadCron();

    const summary = await runLocalEnrichment({ now: 1000 });

    expect(summary).toEqual({ jobs: 1, enriched: 0, failed: 2 });
    expect(state.stamped).toEqual([]);
    expect(state.logs.warn.length).toBeGreaterThan(0);
  });

  it('survives a job listing failure', async () => {
    state.throwOnJobs = true;
    const { runLocalEnrichment } = await loadCron();

    await expect(runLocalEnrichment({ now: 1000 })).resolves.toEqual({ jobs: 0, enriched: 0, failed: 0 });
  });
});
