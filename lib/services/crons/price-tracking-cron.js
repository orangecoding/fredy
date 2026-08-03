/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import runPriceTracker from '../listings/priceTrackingService.js';
import logger from '../logger.js';

/**
 * Every second day at 05:00.
 *
 * Well below the default seven-day re-check window on purpose. The cron only decides how often
 * Fredy *looks* for work; how much work there is comes from `priceCheckIntervalDays`, and how much
 * of it one run may do comes from `priceCheckLimitPerRun`. Waking up more often than the window
 * means an operator who lowers the window gets the faster cadence without a restart, while the
 * per-run limit still caps the traffic.
 *
 * 05:00 keeps it away from the alive-checker's four-hourly slots and the retention purge at 03:30,
 * so the heaviest of the three sweeps does not share a window with the others.
 * @type {string}
 */
const PRICE_TRACKING_CRON = '0 5 */2 * *';

/**
 * Guard against a second run starting while the first is still working.
 *
 * A run holds a browser open for as long as it takes to render its whole batch, which on a slow
 * portal can outlast the interval. Two overlapping runs would double the outbound traffic at the
 * exact moment the portal is already answering slowly - the worst possible time to look like a bot.
 * @type {boolean}
 */
let running = false;

/**
 * Re-read prices for the listings that are due.
 *
 * Never throws: a failed sweep costs one cycle of price freshness, which must not take a scheduled
 * task down with it. Whether anything happens at all is decided inside {@link runPriceTracker},
 * which reads the settings live, so toggling price tracking in the UI takes effect on the next run
 * rather than after a restart.
 *
 * Reports whether it actually started. The cron ignores that - a skipped slot is normal and the
 * next one comes along - but somebody who pressed a button needs to be told that nothing happened,
 * rather than being shown a success message for a run that was silently dropped.
 *
 * @returns {Promise<boolean>} False when a run was already in progress.
 */
export async function runPriceTracking() {
  if (running) {
    logger.debug('Price tracking is still running. Skipping this slot.');
    return false;
  }
  running = true;
  try {
    await runPriceTracker();
  } catch (err) {
    logger.warn('Price tracking run failed', err);
  } finally {
    running = false;
  }
  return true;
}

/**
 * Whether a sweep is in progress right now.
 *
 * @returns {boolean}
 */
export function isPriceTrackingRunning() {
  return running;
}

/**
 * Schedule the price tracking sweep.
 *
 * Deliberately *not* run on start, unlike the other listing crons. Those issue plain requests; this
 * one launches a browser and renders up to `priceCheckLimitPerRun` pages, and doing that while the
 * instance is still coming up would make every restart the heaviest moment of the day.
 *
 * @returns {void}
 */
export function initPriceTrackingCron() {
  cron.schedule(PRICE_TRACKING_CRON, runPriceTracking);
}
