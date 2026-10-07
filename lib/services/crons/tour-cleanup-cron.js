/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import { cleanupAbandonedTours } from '../tour/tourService.js';
import logger from '../logger.js';

/**
 * Every ten minutes.
 *
 * The sweep is one settings read per user and costs nothing when no tour is running, and the
 * example data it removes is invented listings sitting in somebody's real account. Hourly would let
 * those linger for most of an hour past their time.
 */
const TOUR_CLEANUP_CRON = '*/10 * * * *';

/**
 * Remove the example data of tours nobody finished.
 *
 * Never throws: a failed sweep is retried ten minutes later and must not take the scheduler down.
 *
 * @returns {number} How many tours were cleaned up.
 */
export function runTourCleanupTask() {
  try {
    return cleanupAbandonedTours();
  } catch (err) {
    logger.warn('Onboarding tour cleanup failed', err);
    return 0;
  }
}

/**
 * Schedule the tour cleanup.
 *
 * Runs once on start as well: a tour abandoned while the process was down is exactly the case the
 * browser could not clean up after, and there is no reason to wait for the first tick.
 *
 * @returns {void}
 */
export function initTourCleanupCron() {
  runTourCleanupTask();
  cron.schedule(TOUR_CLEANUP_CRON, runTourCleanupTask);
}
