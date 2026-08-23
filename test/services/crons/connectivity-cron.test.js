/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const sweeperPath = root + '/lib/services/connectivity/connectivitySweeper.js';
const loggerPath = root + '/lib/services/logger.js';

let state;

async function loadCron() {
  vi.resetModules();
  vi.doMock(sweeperPath, () => ({
    default: async () => {
      state.sweeps += 1;
      if (state.throws) {
        throw new Error('the register is unreachable');
      }
      // Held open until the test releases it, so an overlapping trigger has something to collide
      // with.
      if (state.gate != null) {
        await state.gate;
      }
      return { enriched: 0, empty: 0, skipped: 0 };
    },
  }));
  vi.doMock(loggerPath, () => ({ default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } }));
  vi.doMock('node-cron', () => ({ default: { schedule: (expression) => state.scheduled.push(expression) } }));
  return import(root + '/lib/services/crons/connectivity-cron.js');
}

/**
 * When the connectivity sweep runs.
 *
 * It used to hang off the geocoding sweep, which meant a listing scraped a minute ago waited up to
 * six hours for its card to fill in - the case that is easy to get wrong and invisible in every
 * unit test of the sweep itself. It now has three ways in, and what has to hold is that they cannot
 * run over each other.
 */
describe('services/crons/connectivity-cron', () => {
  beforeEach(() => {
    state = { sweeps: 0, throws: false, scheduled: [], gate: null };
  });

  it('sweeps when asked', async () => {
    const { runConnectivity } = await loadCron();

    expect(await runConnectivity()).toBe(true);
    expect(state.sweeps).toBe(1);
  });

  it('drops a trigger while a sweep is still running', async () => {
    // The schedule, the start-up run and the end of a job run can all fire within a minute of each
    // other, and two sweeps would ask the same registers for the same cells twice.
    let release;
    state.gate = new Promise((resolve) => {
      release = resolve;
    });
    const { runConnectivity, isConnectivitySweepRunning } = await loadCron();

    const first = runConnectivity();
    expect(isConnectivitySweepRunning()).toBe(true);
    expect(await runConnectivity()).toBe(false);

    release();
    await first;

    expect(state.sweeps).toBe(1);
    expect(isConnectivitySweepRunning()).toBe(false);
  });

  it('swallows a failed sweep rather than taking its caller down', async () => {
    // Two of the three callers are a scheduled task and the tail of a job run, neither of which may
    // fail because a register had a bad minute.
    state.throws = true;
    const { runConnectivity, isConnectivitySweepRunning } = await loadCron();

    expect(await runConnectivity()).toBe(true);
    expect(isConnectivitySweepRunning()).toBe(false);
  });

  it('sweeps once on start and then on a schedule', async () => {
    const { initConnectivityCron } = await loadCron();

    initConnectivityCron();
    // The start-up run is not awaited by the initialiser, so give it a turn.
    await Promise.resolve();

    expect(state.sweeps).toBe(1);
    expect(state.scheduled).toEqual(['40 * * * *']);
  });

  it('keeps out of the other sweeps’ slots', async () => {
    // Geocoding runs at the top of the hour and travel times at twenty past. Three sweeps sharing a
    // slot would compete for the same outbound throttles.
    const { initConnectivityCron } = await loadCron();

    initConnectivityCron();

    const minute = Number(state.scheduled[0].split(' ')[0]);
    expect([0, 20]).not.toContain(minute);
  });
});
