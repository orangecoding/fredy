/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import runActiveChecker from '../listings/listingActiveService.js';

async function runTask() {
  await runActiveChecker();
}

export async function initActiveCheckerCron() {
  //run directly on start
  await runTask();
  // then every day at 1 am
  cron.schedule('0 1 * * *', runTask);
}
