/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const storagePath = root + '/lib/services/storage/listingsStorage.js';
const settingsPath = root + '/lib/services/storage/settingsStorage.js';
const jobStoragePath = root + '/lib/services/storage/jobStorage.js';
const notifyPath = root + '/lib/notification/notify.js';
const loggerPath = root + '/lib/services/logger.js';

let state;

/**
 * Load the service with storage, settings, jobs and the notification fan-out replaced.
 *
 * @returns {Promise<any>} The service module.
 */
async function loadService() {
  vi.resetModules();
  vi.doMock(storagePath, () => ({
    recordPriceObservation: (...args) => state.observations.push(args),
    applyPriceChange: (...args) => state.applied.push(args),
  }));
  vi.doMock(settingsPath, () => ({
    getSettings: async () => state.settings,
    getUserSettings: () => state.userSettings,
  }));
  vi.doMock(jobStoragePath, () => ({ getJob: (id) => state.jobs[id] ?? null }));
  vi.doMock(notifyPath, () => ({
    sendPriceChange: (...args) => {
      state.sent.push(args);
      return [Promise.resolve()];
    },
  }));
  vi.doMock(loggerPath, () => ({
    default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  }));
  return import(root + '/lib/services/listings/priceHistoryService.js');
}

const listing = (price, overrides = {}) => ({
  id: 'l1',
  price,
  job_id: 'job1',
  provider: 'immowelt',
  title: 'A flat',
  ...overrides,
});

beforeEach(() => {
  state = {
    observations: [],
    applied: [],
    sent: [],
    settings: { baseUrl: 'https://fredy.example' },
    userSettings: { language: 'en' },
    jobs: { job1: { id: 'job1', userId: 'u1', name: 'Job', notificationAdapter: [{ id: 'console' }] } },
  };
});

describe('services/listings/priceHistoryService', () => {
  describe('recordPriceChange', () => {
    it('records the observation and reports a drop past the threshold', async () => {
      const { recordPriceChange } = await loadService();
      const change = recordPriceChange(listing(1200), 1100, { source: 'priceProbe', thresholdPercent: 1 });

      expect(state.observations).toHaveLength(1);
      expect(state.applied[0].slice(0, 2)).toEqual(['l1', 1100]);
      expect(change).toMatchObject({ oldPrice: 1200, newPrice: 1100, direction: 'down' });
      expect(change.changePercent).toBeCloseTo(-8.333, 2);
    });

    it('reports an increase as an increase', async () => {
      const { recordPriceChange } = await loadService();
      expect(recordPriceChange(listing(1000), 1100, { thresholdPercent: 1 })).toMatchObject({ direction: 'up' });
    });

    // The distinction the whole threshold exists for: the data is still true and still worth
    // charting, it is just not worth a push notification at three in the morning.
    it('still records a sub-threshold move but reports nothing to notify', async () => {
      const { recordPriceChange } = await loadService();
      const change = recordPriceChange(listing(1000), 1005, { thresholdPercent: 1 });

      expect(change).toBeNull();
      expect(state.observations).toHaveLength(1);
      expect(state.applied).toHaveLength(1);
    });

    it('does nothing at all when the price has not moved', async () => {
      const { recordPriceChange } = await loadService();
      expect(recordPriceChange(listing(1200), 1200, { thresholdPercent: 1 })).toBeNull();
      expect(state.observations).toHaveLength(0);
      expect(state.applied).toHaveLength(0);
    });

    // A price we could not read is not a price of zero. Recording it would wipe out the real value
    // and report a total collapse to everyone watching the listing.
    it.each([null, undefined, 0, -5, NaN])('ignores the unusable reading %s', async (reading) => {
      const { recordPriceChange } = await loadService();
      expect(recordPriceChange(listing(1200), reading, { thresholdPercent: 1 })).toBeNull();
      expect(state.observations).toHaveLength(0);
    });

    it('seeds a baseline without reporting a change when the listing had no price', async () => {
      const { recordPriceChange } = await loadService();
      const change = recordPriceChange(listing(null), 900, { thresholdPercent: 1 });

      expect(change).toBeNull();
      expect(state.observations).toHaveLength(1);
    });

    it('reports every change when the threshold is zero', async () => {
      const { recordPriceChange } = await loadService();
      expect(recordPriceChange(listing(1000), 1001, { thresholdPercent: 0 })).not.toBeNull();
    });
  });

  describe('notifyPriceChanges', () => {
    const change = (jobId) => ({
      listing: listing(1100, { job_id: jobId }),
      oldPrice: 1200,
      newPrice: 1100,
      changePercent: -8.33,
      direction: 'down',
    });

    it('groups a sweep by job and dispatches once per job', async () => {
      state.jobs.job2 = { id: 'job2', userId: 'u2', name: 'Other', notificationAdapter: [{ id: 'ntfy' }] };
      const { notifyPriceChanges } = await loadService();

      await notifyPriceChanges([change('job1'), change('job2'), change('job1')]);

      expect(state.sent).toHaveLength(2);
      const jobKeys = state.sent.map(([, , , jobKey]) => jobKey);
      expect(jobKeys).toEqual(['job1', 'job2']);
      // Both of job1's changes travel in one call rather than one call each.
      expect(state.sent[0][1]).toHaveLength(2);
    });

    // Every adapter renders serviceName as the portal a listing came from, and a single job can
    // search several. Grouping by job alone labelled the whole batch with whichever provider sorted
    // first, so an Immowelt drop could arrive announced as Kleinanzeigen.
    it('splits one job by provider so each batch is labelled with the portal it came from', async () => {
      const { notifyPriceChanges } = await loadService();

      await notifyPriceChanges([
        { ...change('job1'), listing: listing(1100, { job_id: 'job1', provider: 'immowelt' }) },
        { ...change('job1'), listing: listing(900, { job_id: 'job1', provider: 'kleinanzeigen' }) },
        { ...change('job1'), listing: listing(800, { job_id: 'job1', provider: 'immowelt' }) },
      ]);

      expect(state.sent).toHaveLength(2);
      const byProvider = Object.fromEntries(state.sent.map(([serviceName, batch]) => [serviceName, batch.length]));
      expect(byProvider).toEqual({ immowelt: 2, kleinanzeigen: 1 });
      // Still one job, so both batches carry its adapter config and job key.
      expect(state.sent.every(([, , , jobKey]) => jobKey === 'job1')).toBe(true);
    });

    it('formats prices before handing them to the adapters', async () => {
      const { notifyPriceChanges } = await loadService();
      await notifyPriceChanges([change('job1')]);

      expect(state.sent[0][1][0]).toMatchObject({
        oldPrice: '1200 €',
        newPrice: '1100 €',
        changePercent: '-8.3 %',
        changeHeadline: 'Price reduced',
      });
    });

    it('uses the job owner language for the headline', async () => {
      state.userSettings = { language: 'de' };
      const { notifyPriceChanges } = await loadService();
      await notifyPriceChanges([change('job1')]);

      expect(state.sent[0][1][0].changeHeadline).toBe('Preis gesenkt');
    });

    it('skips a job that has gone away rather than throwing', async () => {
      const { notifyPriceChanges } = await loadService();
      await expect(notifyPriceChanges([change('missing')])).resolves.toBeUndefined();
      expect(state.sent).toHaveLength(0);
    });

    it('skips a job with no adapters configured', async () => {
      state.jobs.job1.notificationAdapter = [];
      const { notifyPriceChanges } = await loadService();
      await notifyPriceChanges([change('job1')]);
      expect(state.sent).toHaveLength(0);
    });

    // One job's misconfigured adapter must not swallow every other job's notifications.
    it('carries on after one job fails', async () => {
      state.jobs.job2 = { id: 'job2', userId: 'u2', name: 'Other', notificationAdapter: [{ id: 'ntfy' }] };
      const { notifyPriceChanges } = await loadService();
      let calls = 0;
      const notify = await import(notifyPath);
      notify.sendPriceChange = (...args) => {
        calls += 1;
        if (calls === 1) throw new Error('adapter exploded');
        state.sent.push(args);
        return [Promise.resolve()];
      };

      await notifyPriceChanges([change('job1'), change('job2')]);
      expect(state.sent).toHaveLength(1);
    });
  });
});
