/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const sessionStorePath = root + '/lib/services/storage/sessionStore.js';
const loggerPath = root + '/lib/services/logger.js';

let state;

async function loadCron() {
  vi.resetModules();
  vi.doMock(sessionStorePath, () => ({
    sweepExpiredSessions: () => {
      state.sweepRuns += 1;
      if (state.throwOnSweep) throw new Error('database is locked');
      return state.removed;
    },
  }));
  vi.doMock(loggerPath, () => ({
    default: {
      debug: (...args) => state.logs.debug.push(args.join(' ')),
      info: () => {},
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
  return import(root + '/lib/services/crons/session-cleanup-cron.js');
}

/**
 * Expired sessions are already rejected on read, so this sweep is purely about keeping the table
 * from growing without bound. It used to be a `setInterval` armed by the session store itself;
 * scheduling now sits with Fredy's other periodic work.
 */
describe('services/crons/session-cleanup-cron', () => {
  beforeEach(() => {
    state = { scheduled: [], sweepRuns: 0, removed: 0, throwOnSweep: false, logs: { debug: [], warn: [] } };
  });

  it('schedules the sweep hourly', async () => {
    const { initSessionCleanupCron } = await loadCron();

    await initSessionCleanupCron();

    expect(state.scheduled).toHaveLength(1);
    expect(state.scheduled[0].expression).toBe('0 * * * *');
  });

  it('sweeps once on start, so a long downtime is not carried for another hour', async () => {
    const { initSessionCleanupCron } = await loadCron();

    await initSessionCleanupCron();

    expect(state.sweepRuns).toBe(1);
  });

  it('sweeps again on every tick', async () => {
    const { initSessionCleanupCron } = await loadCron();
    await initSessionCleanupCron();

    state.scheduled[0].handler();
    state.scheduled[0].handler();

    expect(state.sweepRuns).toBe(3);
  });

  it('reports how many rows it removed', async () => {
    state.removed = 4;
    const { initSessionCleanupCron } = await loadCron();

    await initSessionCleanupCron();

    expect(state.logs.debug.some((line) => line.includes('4'))).toBe(true);
  });

  it('stays quiet when there was nothing to remove', async () => {
    const { initSessionCleanupCron } = await loadCron();

    await initSessionCleanupCron();

    expect(state.logs.debug).toEqual([]);
  });

  it('survives a failing sweep rather than taking the scheduler down with it', async () => {
    state.throwOnSweep = true;
    const { initSessionCleanupCron } = await loadCron();

    await expect(initSessionCleanupCron()).resolves.toBeUndefined();
    expect(state.logs.warn.some((line) => line.includes('Session cleanup failed'))).toBe(true);
    // Still scheduled: one bad sweep costs some dead rows until the next hour, nothing more.
    expect(state.scheduled).toHaveLength(1);
    expect(() => state.scheduled[0].handler()).not.toThrow();
  });
});
