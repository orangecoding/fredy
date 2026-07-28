/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import { sweepExpiredSessions } from '../storage/sessionStore.js';
import logger from '../logger.js';

/**
 * Every hour, on the hour.
 *
 * Expired sessions are already rejected on read, so this is only about not letting the table grow
 * without bound. Hourly is plenty, and a fixed schedule means the sweep does not drift with restarts
 * the way a `setInterval` armed at boot does.
 */
const SESSION_CLEANUP_CRON = '0 * * * *';

/**
 * Remove the sessions that have expired.
 *
 * Never throws: a failed sweep costs some dead rows until the next hour, which must not be allowed
 * to take a scheduled task down with it.
 *
 * @returns {number} How many rows were removed.
 */
function runTask() {
  try {
    const removed = sweepExpiredSessions();
    if (removed > 0) {
      logger.debug(`Removed ${removed} expired session(s).`);
    }
    return removed;
  } catch (err) {
    logger.warn('Session cleanup failed', err);
    return 0;
  }
}

/**
 * Schedule the hourly session cleanup.
 *
 * Runs once on start as well, because a process that was down over a weekend comes back to a table
 * full of sessions that expired while it was away, and there is no reason to carry those for
 * another hour.
 *
 * @returns {Promise<void>}
 */
export async function initSessionCleanupCron() {
  runTask();
  cron.schedule(SESSION_CLEANUP_CRON, runTask);
}
