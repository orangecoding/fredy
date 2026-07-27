/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const demoServicePath = root + '/lib/services/demo/demoService.js';
const settingsStoragePath = root + '/lib/services/storage/settingsStorage.js';
const loggerPath = root + '/lib/services/logger.js';

let state;

async function loadCron() {
  vi.resetModules();
  vi.doMock(demoServicePath, () => ({
    cleanupDemoData: async () => {
      state.cleanupRuns += 1;
    },
  }));
  vi.doMock(settingsStoragePath, () => ({
    getSettings: async () => state.settings,
  }));
  vi.doMock(loggerPath, () => ({
    default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  }));
  vi.doMock('node-cron', () => ({
    default: {
      schedule: (expression, handler) => {
        state.scheduled.push({ expression, handler });
      },
    },
  }));
  return import(root + '/lib/services/crons/demo-cleanup-cron.js');
}

describe('services/crons/demo-cleanup-cron', () => {
  beforeEach(() => {
    state = { settings: { demoMode: true }, scheduled: [], cleanupRuns: 0 };
  });

  it('schedules the demo cleanup at midnight when demo mode is on', async () => {
    const { initDemoCleanupCron } = await loadCron();

    await initDemoCleanupCron();

    expect(state.scheduled).toHaveLength(1);
    expect(state.scheduled[0].expression).toBe('0 0 * * *');
  });

  it('schedules the cleanup itself as the handler', async () => {
    const { initDemoCleanupCron } = await loadCron();

    await initDemoCleanupCron();
    await state.scheduled[0].handler();

    expect(state.cleanupRuns).toBe(1);
  });

  it('does not run the cleanup on start', async () => {
    const { initDemoCleanupCron } = await loadCron();

    await initDemoCleanupCron();

    expect(state.cleanupRuns).toBe(0);
  });

  it('schedules nothing when demo mode is off', async () => {
    state.settings.demoMode = false;
    const { initDemoCleanupCron } = await loadCron();

    await initDemoCleanupCron();

    expect(state.scheduled).toEqual([]);
  });
});
