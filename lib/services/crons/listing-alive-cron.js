/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import runActiveChecker from '../listings/listingActiveService.js';
import logger from '../logger.js';

/**
 * Every four hours rather than once a night.
 *
 * The checker now probes a bounded slice per run (see runActiveChecker), so it needs to run more
 * often to work through a large database in reasonable time: six runs a day at 500 listings cycles
 * 10.000 listings in roughly three days, well inside the seven-day staleness window. The old
 * arrangement had no cap and did the whole set in one nightly burst.
 */
const ACTIVE_CHECK_CRON = '0 */4 * * *';

/** Guards against a slow run still being in flight when the next tick fires. */
let running = false;

async function runTask() {
  if (running) {
    logger.debug('Active checker still running. Skipping this tick.');
    return;
  }
  running = true;
  try {
    await runActiveChecker();
  } catch (err) {
    logger.error('Active checker failed', err);
  } finally {
    running = false;
  }
}

export async function initActiveCheckerCron() {
  //run directly on start
  await runTask();
  cron.schedule(ACTIVE_CHECK_CRON, runTask);
}
