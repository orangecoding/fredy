/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import { syncMailAccount } from '../mail/imapSyncService.js';
import { getEnabledMailAccountsForSync } from '../storage/mailStorage.js';
import logger from '../logger.js';

export const DEFAULT_MAIL_SYNC_CRON = '*/10 * * * *';
let running = false;

/**
 * Synchronize every enabled mailbox sequentially. A process-wide guard avoids
 * overlapping sweeps; the account-level guard in imapSyncService also merges
 * a manual sync with a scheduled one.
 *
 * @returns {Promise<{accounts:number,succeeded:number,failed:number,skipped:boolean}>}
 */
export async function runMailSyncTask() {
  if (running) return { accounts: 0, succeeded: 0, failed: 0, skipped: true };
  running = true;
  try {
    const accounts = getEnabledMailAccountsForSync();
    let succeeded = 0;
    let failed = 0;
    for (const account of accounts) {
      try {
        await syncMailAccount(account.id, account.userId);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        logger.warn(`Scheduled mail sync failed for account ${account.id}.`, error);
      }
    }
    return { accounts: accounts.length, succeeded, failed, skipped: false };
  } catch (error) {
    logger.warn('Scheduled mail sync sweep failed.', error);
    return { accounts: 0, succeeded: 0, failed: 1, skipped: false };
  } finally {
    running = false;
  }
}

/**
 * Schedule incoming-mail synchronization. Invalid custom expressions fall
 * back to ten minutes so a typo cannot prevent Fredy from starting.
 *
 * @returns {void}
 */
export function initMailSyncCron() {
  const configured = process.env.FREDY_MAIL_SYNC_CRON?.trim();
  const schedule = configured && cron.validate(configured) ? configured : DEFAULT_MAIL_SYNC_CRON;
  if (configured && schedule !== configured) {
    logger.warn(`Invalid FREDY_MAIL_SYNC_CRON; using ${DEFAULT_MAIL_SYNC_CRON}.`);
  }
  cron.schedule(schedule, () => {
    void runMailSyncTask();
  });
  logger.info(`Incoming mail sync scheduled with cron: ${schedule}`);
}
