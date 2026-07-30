/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import { purgeExpiredInactiveListings } from '../storage/listingsStorage.js';
import { getSettings } from '../storage/settingsStorage.js';
import logger from '../logger.js';

/**
 * Once a day at 03:30.
 *
 * Deleting is cheap and purely local, and the retention period is measured in days, so there is
 * nothing to gain from running it more often. Kept out of the alive-checker cron on purpose: that one
 * runs every four hours because of its request budget, and mixing an irreversible delete into a job
 * whose schedule is driven by outbound traffic ties two unrelated concerns together.
 * @type {string}
 */
const LISTING_RETENTION_CRON = '30 3 * * *';

/**
 * Default retention period used when the setting is missing (fresh install before the migration
 * seeded it, or a value that was deleted by hand).
 * @type {number}
 */
const DEFAULT_RETENTION_DAYS = 14;

/**
 * Hard delete the listings whose grace period has run out.
 *
 * Reads `listingRetentionDays` on every run rather than once at startup, so a change in the settings
 * UI takes effect on the next run instead of after a restart. `0` disables the purge entirely.
 *
 * Never throws: a failed purge costs some dead rows until tomorrow, which must not take a scheduled
 * task down with it.
 *
 * @returns {Promise<number>} How many listings were removed.
 */
export async function runListingRetention() {
  try {
    const settings = await getSettings();
    const configured = Number(settings?.listingRetentionDays ?? DEFAULT_RETENTION_DAYS);
    const retentionDays = Number.isFinite(configured) ? Math.floor(configured) : DEFAULT_RETENTION_DAYS;

    if (retentionDays <= 0) {
      logger.debug('Listing retention is disabled. Keeping inactive listings.');
      return 0;
    }

    const { changes } = purgeExpiredInactiveListings({ retentionDays });
    if (changes > 0) {
      logger.info(`Hard deleted ${changes} listing(s) offline for more than ${retentionDays} day(s).`);
    } else {
      logger.debug('No inactive listings past their retention period.');
    }
    return changes;
  } catch (err) {
    logger.warn('Listing retention purge failed', err);
    return 0;
  }
}

/**
 * Schedule the daily retention purge.
 *
 * Runs once on start as well: an instance that was down for a week comes back to listings whose
 * grace period expired while it was away.
 *
 * @returns {Promise<void>}
 */
export async function initListingRetentionCron() {
  await runListingRetention();
  cron.schedule(LISTING_RETENTION_CRON, runListingRetention);
}
