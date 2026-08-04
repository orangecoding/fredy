/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import runTravelTimeSweep from '../listings/travelTimeSweeper.js';
import logger from '../logger.js';

/**
 * Every two hours, twenty past.
 *
 * Two hours because a sweep is capped at `travelTimeLimitPerRun` journeys: a fresh instance with a
 * few hundred listings needs several runs to work through them, and spreading that over a day is the
 * polite way to use a service run by volunteers. Twenty past keeps it out of the geocoding sweep's
 * slot at the top of the hour, so the two do not compete for the same outbound throttles.
 * @type {string}
 */
const TRAVEL_TIME_CRON = '20 */2 * * *';

/**
 * Guard against a second sweep starting while the first is still working.
 *
 * A run paced at two requests a second can easily outlast a short interval, and two overlapping runs
 * would fetch the same journeys twice and race each other through the shared rate limit.
 * @type {boolean}
 */
let running = false;

/**
 * Fill in the travel times that are missing or stale.
 *
 * Never throws: a failed sweep costs one cycle of freshness, which must not take a scheduled task
 * down with it, and every listing keeps the straight-line distance it always had.
 *
 * @returns {Promise<boolean>} False when a sweep was already in progress.
 */
export async function runTravelTimes() {
  if (running) {
    logger.debug('Travel time sweep is still running. Skipping this slot.');
    return false;
  }
  running = true;
  try {
    await runTravelTimeSweep();
  } catch (err) {
    logger.warn('Travel time sweep failed', err);
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
export function isTravelTimeSweepRunning() {
  return running;
}

/**
 * Schedule the travel time sweep.
 *
 * Deliberately not run on start. A restart is exactly the moment an instance has the least to spare,
 * and a sweep that waits two hours costs nothing - the listings keep their straight-line distances
 * in the meantime.
 *
 * @returns {void}
 */
export function initTravelTimeCron() {
  cron.schedule(TRAVEL_TIME_CRON, runTravelTimes);
}
