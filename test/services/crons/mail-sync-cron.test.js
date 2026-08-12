/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const root = (await import('node:path')).resolve('.');
const syncPath = root + '/lib/services/mail/imapSyncService.js';
const storagePath = root + '/lib/services/storage/mailStorage.js';
const loggerPath = root + '/lib/services/logger.js';
let state;

async function loadCron() {
  vi.resetModules();
  vi.doMock(storagePath, () => ({
    getEnabledMailAccountsForSync: () => state.accounts,
  }));
  vi.doMock(syncPath, () => ({
    syncMailAccount: async (accountId, userId) => {
      state.syncs.push({ accountId, userId });
      if (state.deferred) await state.deferred.promise;
      if (state.failIds.has(accountId)) throw new Error('authentication failed');
      return { fetched: 0, stored: 0, matched: 0, lastUid: null };
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
      validate: (expression) => expression !== 'invalid',
      schedule: (expression, handler) => state.scheduled.push({ expression, handler }),
    },
  }));
  return import(root + '/lib/services/crons/mail-sync-cron.js');
}

describe('services/crons/mail-sync-cron', () => {
  beforeEach(() => {
    delete process.env.FREDY_MAIL_SYNC_CRON;
    state = {
      accounts: [],
      syncs: [],
      failIds: new Set(),
      deferred: null,
      scheduled: [],
      logs: { info: [], warn: [] },
    };
  });

  it('schedules enabled mailboxes every ten minutes by default', async () => {
    const { initMailSyncCron } = await loadCron();

    initMailSyncCron();

    expect(state.scheduled[0].expression).toBe('*/10 * * * *');
  });

  it('falls back safely when a custom cron expression is invalid', async () => {
    process.env.FREDY_MAIL_SYNC_CRON = 'invalid';
    const { initMailSyncCron } = await loadCron();

    initMailSyncCron();

    expect(state.scheduled[0].expression).toBe('*/10 * * * *');
    expect(state.logs.warn.some((line) => line.includes('Invalid FREDY_MAIL_SYNC_CRON'))).toBe(true);
  });

  it('continues with other accounts after one mailbox fails', async () => {
    state.accounts = [
      { id: 'account-1', userId: 'user-1' },
      { id: 'account-2', userId: 'user-2' },
    ];
    state.failIds.add('account-1');
    const { runMailSyncTask } = await loadCron();

    const result = await runMailSyncTask();

    expect(state.syncs).toEqual([
      { accountId: 'account-1', userId: 'user-1' },
      { accountId: 'account-2', userId: 'user-2' },
    ]);
    expect(result).toEqual({ accounts: 2, succeeded: 1, failed: 1, skipped: false });
  });

  it('contains a database failure without creating an unhandled cron rejection', async () => {
    state.accounts = null;
    const { runMailSyncTask } = await loadCron();

    const result = await runMailSyncTask();

    expect(result).toEqual({ accounts: 0, succeeded: 0, failed: 1, skipped: false });
    expect(state.logs.warn.some((line) => line.includes('Scheduled mail sync sweep failed'))).toBe(true);
  });

  it('skips an overlapping scheduled sweep', async () => {
    let release;
    state.accounts = [{ id: 'account-1', userId: 'user-1' }];
    state.deferred = { promise: new Promise((resolve) => (release = resolve)) };
    const { runMailSyncTask } = await loadCron();

    const first = runMailSyncTask();
    const second = await runMailSyncTask();
    release();
    await first;

    expect(second).toEqual({ accounts: 0, succeeded: 0, failed: 0, skipped: true });
    expect(state.syncs).toHaveLength(1);
  });
});
