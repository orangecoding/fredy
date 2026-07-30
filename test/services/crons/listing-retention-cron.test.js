/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const listingsStoragePath = root + '/lib/services/storage/listingsStorage.js';
const settingsStoragePath = root + '/lib/services/storage/settingsStorage.js';
const loggerPath = root + '/lib/services/logger.js';

let state;

async function loadCron() {
  vi.resetModules();
  vi.doMock(listingsStoragePath, () => ({
    purgeExpiredInactiveListings: (args) => {
      state.purgeCalls.push(args);
      if (state.throwOnPurge) throw new Error('database is locked');
      return { changes: state.removed };
    },
  }));
  vi.doMock(settingsStoragePath, () => ({
    getSettings: async () => state.settings,
  }));
  vi.doMock(loggerPath, () => ({
    default: {
      debug: (...args) => state.logs.debug.push(args.join(' ')),
      info: (...args) => state.logs.info.push(args.join(' ')),
      warn: (...args) => state.logs.warn.push(args.join(' ')),
      error: () => {},
    },
  }));
  vi.doMock('node-cron', () => ({
    default: { schedule: (expression, handler) => state.scheduled.push({ expression, handler }) },
  }));
  return import(root + '/lib/services/crons/listing-retention-cron.js');
}

/**
 * The purge is the only automatic, irreversible delete in Fredy. What these tests pin is that it only
 * runs when the operator asked for it, that the configured period is read fresh on every run, and
 * that a failure costs nothing but a day of delay.
 */
describe('services/crons/listing-retention-cron', () => {
  beforeEach(() => {
    state = {
      scheduled: [],
      purgeCalls: [],
      removed: 0,
      throwOnPurge: false,
      settings: { listingRetentionDays: 14 },
      logs: { debug: [], info: [], warn: [] },
    };
  });

  it('schedules the purge once a day', async () => {
    const { initListingRetentionCron } = await loadCron();

    await initListingRetentionCron();

    expect(state.scheduled).toHaveLength(1);
    expect(state.scheduled[0].expression).toBe('30 3 * * *');
  });

  it('purges once on start, because a grace period can expire during downtime', async () => {
    const { initListingRetentionCron } = await loadCron();

    await initListingRetentionCron();

    expect(state.purgeCalls).toEqual([{ retentionDays: 14 }]);
  });

  it('reads the setting on every run rather than snapshotting it at startup', async () => {
    const { initListingRetentionCron } = await loadCron();
    await initListingRetentionCron();

    // Changed in the settings UI after boot; the next run has to use the new value, not require a
    // restart.
    state.settings = { listingRetentionDays: 30 };
    await state.scheduled[0].handler();

    expect(state.purgeCalls).toEqual([{ retentionDays: 14 }, { retentionDays: 30 }]);
  });

  it('deletes nothing when retention is set to zero', async () => {
    state.settings = { listingRetentionDays: 0 };
    const { runListingRetention } = await loadCron();

    expect(await runListingRetention()).toBe(0);
    expect(state.purgeCalls).toEqual([]);
  });

  it('falls back to the default when the setting is missing', async () => {
    state.settings = {};
    const { runListingRetention } = await loadCron();

    await runListingRetention();

    expect(state.purgeCalls).toEqual([{ retentionDays: 14 }]);
  });

  it('falls back to the default for a value that is not a number', async () => {
    state.settings = { listingRetentionDays: 'forever' };
    const { runListingRetention } = await loadCron();

    await runListingRetention();

    expect(state.purgeCalls).toEqual([{ retentionDays: 14 }]);
  });

  it('accepts a numeric string, which is what the settings form may store', async () => {
    state.settings = { listingRetentionDays: '7' };
    const { runListingRetention } = await loadCron();

    await runListingRetention();

    expect(state.purgeCalls).toEqual([{ retentionDays: 7 }]);
  });

  it('reports how many listings it removed', async () => {
    state.removed = 3;
    const { runListingRetention } = await loadCron();

    expect(await runListingRetention()).toBe(3);
    expect(state.logs.info.some((line) => line.includes('3'))).toBe(true);
  });

  it('survives a failing purge rather than taking the scheduler down with it', async () => {
    state.throwOnPurge = true;
    const { initListingRetentionCron } = await loadCron();

    await expect(initListingRetentionCron()).resolves.toBeUndefined();
    expect(state.logs.warn.some((line) => line.includes('Listing retention purge failed'))).toBe(true);
    expect(state.scheduled).toHaveLength(1);
  });
});
