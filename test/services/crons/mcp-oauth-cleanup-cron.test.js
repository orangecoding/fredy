/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const storagePath = root + '/lib/mcp/mcpOAuthStorage.js';
const loggerPath = root + '/lib/services/logger.js';

let state;

async function loadCron() {
  vi.resetModules();
  vi.doMock(storagePath, () => ({
    sweepExpired: () => {
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
  return import(root + '/lib/services/crons/mcp-oauth-cleanup-cron.js');
}

/**
 * Expired OAuth codes and tokens are already rejected on read, so this sweep is purely about keeping
 * the tables from growing without bound - and about dropping client registrations that were made
 * and never used, since registration needs no login.
 */
describe('services/crons/mcp-oauth-cleanup-cron', () => {
  beforeEach(() => {
    state = { scheduled: [], sweepRuns: 0, removed: 0, throwOnSweep: false, logs: { debug: [], warn: [] } };
  });

  it('schedules the sweep hourly, off the hour so it does not collide with the session sweep', async () => {
    const { initMcpOAuthCleanupCron } = await loadCron();

    await initMcpOAuthCleanupCron();

    expect(state.scheduled).toHaveLength(1);
    expect(state.scheduled[0].expression).toBe('20 * * * *');
  });

  it('sweeps once on start, so a long downtime is not carried for another hour', async () => {
    const { initMcpOAuthCleanupCron } = await loadCron();

    await initMcpOAuthCleanupCron();

    expect(state.sweepRuns).toBe(1);
  });

  it('sweeps again on every tick', async () => {
    const { initMcpOAuthCleanupCron } = await loadCron();
    await initMcpOAuthCleanupCron();

    state.scheduled[0].handler();
    state.scheduled[0].handler();

    expect(state.sweepRuns).toBe(3);
  });

  it('reports how many rows it removed', async () => {
    state.removed = 4;
    const { initMcpOAuthCleanupCron } = await loadCron();

    await initMcpOAuthCleanupCron();

    expect(state.logs.debug.some((line) => line.includes('4'))).toBe(true);
  });

  it('stays quiet when there was nothing to remove', async () => {
    const { initMcpOAuthCleanupCron } = await loadCron();

    await initMcpOAuthCleanupCron();

    expect(state.logs.debug).toEqual([]);
  });

  it('survives a failing sweep rather than taking the scheduler down with it', async () => {
    state.throwOnSweep = true;
    const { initMcpOAuthCleanupCron } = await loadCron();

    await expect(initMcpOAuthCleanupCron()).resolves.toBeUndefined();
    expect(state.logs.warn.some((line) => line.includes('MCP OAuth cleanup failed'))).toBe(true);
    // Still scheduled: one bad sweep costs some dead rows until the next hour, nothing more.
    expect(state.scheduled).toHaveLength(1);
    expect(() => state.scheduled[0].handler()).not.toThrow();
  });
});
