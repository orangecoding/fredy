/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import { sweepExpired } from '../../mcp/mcpOAuthStorage.js';
import logger from '../logger.js';

/**
 * Every hour, at twenty past.
 *
 * Expired codes and tokens are already rejected on read, so this is only about not letting the
 * tables grow without bound - the same reasoning as the session sweep, offset from it so the two
 * do not contend for the write lock on the hour.
 */
const MCP_OAUTH_CLEANUP_CRON = '20 * * * *';

/**
 * Remove expired OAuth credentials and abandoned client registrations.
 *
 * Never throws: a failed sweep costs some dead rows until the next hour, which must not be allowed
 * to take a scheduled task down with it.
 *
 * @returns {number} How many rows were removed.
 */
function runTask() {
  try {
    const removed = sweepExpired();
    if (removed > 0) {
      logger.debug(`Removed ${removed} expired MCP OAuth record(s).`);
    }
    return removed;
  } catch (err) {
    logger.warn('MCP OAuth cleanup failed', err);
    return 0;
  }
}

/**
 * Schedule the hourly MCP OAuth cleanup.
 *
 * Runs once on start as well, for the same reason the session sweep does: a process that was down
 * for a while comes back to rows that expired in its absence.
 *
 * @returns {Promise<void>}
 */
export async function initMcpOAuthCleanupCron() {
  runTask();
  cron.schedule(MCP_OAUTH_CLEANUP_CRON, runTask);
}
