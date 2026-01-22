/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { removeJobsByUserId } from '../storage/jobStorage.js';
import { getUsers } from '../storage/userStorage.js';
import logger from '../logger.js';
import cron from 'node-cron';
import { getSettings } from '../storage/settingsStorage.js';

/**
 * if we are running in demo environment, we have to cleanup the db files (specifically the jobs table)
 */
export function cleanupDemoAtMidnight() {
  cron.schedule('0 0 * * *', cleanup);
}

async function cleanup() {
  const settings = await getSettings();
  if (settings.demoMode) {
    const demoUser = getUsers(false).find((user) => user.username === 'demo');
    if (demoUser == null) {
      logger.error('Demo user not found, cannot remove Jobs');
      return Promise.resolve();
    }
    removeJobsByUserId(demoUser.id);
  }
}
