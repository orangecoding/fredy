/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import { cleanupDemoData } from '../demo/demoService.js';
import { getSettings } from '../storage/settingsStorage.js';
import logger from '../logger.js';

/** Every hour - a demo instance returns to its canonical state at the top of each hour. */
const DEMO_CLEANUP_CRON = '0 * * * *';

/**
 * Schedule the hourly demo reset. No-op outside demo mode.
 *
 * Unlike the other crons this one does not run once on start: the seeding in `index.js`
 * already establishes the canonical state, and wiping a visitor's jobs the moment the server
 * restarts would be surprising rather than helpful.
 *
 * @returns {Promise<void>}
 */
export async function initDemoCleanupCron() {
  const settings = await getSettings();
  if (!settings.demoMode) return;

  cron.schedule(DEMO_CLEANUP_CRON, cleanupDemoData);
  logger.info('Demo cleanup cron scheduled hourly.');
}
