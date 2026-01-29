/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import runActiveChecker from '../listings/listingActiveService.js';
import logger from '../logger.js';
import { getSettings } from '../storage/settingsStorage.js';

async function runTask() {
  await runActiveChecker();
}

export async function initActiveCheckerCron() {
  const settings = await getSettings();
  if (settings.demoMode) {
    logger.info('Do not start listing active checker as we are in demo mode');
    return;
  }
  //run directly on start
  await runTask();
  // then every day at 1 am
  cron.schedule('0 1 * * *', runTask);
}
