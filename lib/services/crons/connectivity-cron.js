/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import runConnectivitySweep from '../connectivity/connectivitySweeper.js';
import logger from '../logger.js';

/**
 * Every hour, forty past.
 *
 * Hourly because a sweep is capped at `connectivityLimitPerRun` addresses, so an instance with a
 * back catalogue needs several runs to work through it. Forty past keeps it clear of the geocoding
 * sweep at the top of the hour and the travel time sweep at twenty past, so the three do not
 * compete for the same outbound throttles.
 * @type {string}
 */
const CONNECTIVITY_CRON = '40 * * * *';

/**
 * Guard against a second sweep starting while the first is still working.
 *
 * There are three ways in - the schedule, the start-up run, and the end of a job run - and two of
 * them can easily coincide. Overlapping sweeps would ask the same registers for the same cells
 * twice and race each other through the shared rate limit.
 * @type {boolean}
 */
let running = false;

/**
 * Fill in the connectivity that is missing or stale.
 *
 * Never throws: a failed sweep costs one cycle, which must not take a scheduled task or a job run
 * down with it.
 *
 * @returns {Promise<boolean>} False when a sweep was already in progress.
 */
export async function runConnectivity() {
  if (running) {
    logger.debug('Connectivity sweep is still running. Skipping this trigger.');
    return false;
  }
  running = true;
  try {
    await runConnectivitySweep();
  } catch (err) {
    logger.warn('Connectivity sweep failed', err);
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
export function isConnectivitySweepRunning() {
  return running;
}

/**
 * Schedule the connectivity sweep, and do one now.
 *
 * Run on start, unlike the travel time sweep: this one costs two small JSON requests per address
 * and nothing at all per listing that shares a cell, so it is not the kind of work a restart needs
 * protecting from. An instance upgrading into the feature would otherwise show empty cards for an
 * hour for no reason.
 *
 * @returns {void}
 */
export function initConnectivityCron() {
  runConnectivity();
  cron.schedule(CONNECTIVITY_CRON, runConnectivity);
}
