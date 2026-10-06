/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import { getJobs } from '../storage/jobStorage.js';
import { getSettings, getUserSettings } from '../storage/settingsStorage.js';
import { getUnenrichedListingsForCatchup, stampEnrichmentRequested } from '../storage/listingsStorage.js';
import { formatListing } from '../../utils/formatListing.js';
import { send } from '../../notification/notify.js';
import logger from '../logger.js';

/**
 * Hourly, at half past - offset from the scheduler and the other crons so a restart does not
 * fire everything in the same minute.
 * @type {string}
 */
const ENRICHMENT_CATCHUP_CRON = '30 * * * *';

/** At most this many rows per job per run, oldest first. */
const CATCHUP_LIMIT_PER_JOB = 20;

/**
 * Re-send unscored listings through the normal webhook path.
 *
 * A listing can miss enrichment without anything being broken: the pipeline's webhook throw is
 * logged and forgotten, a restart kills in-flight backend tasks, a 401 deploy window drops a
 * whole burst. The scheduler only ever sends what it just found, so without this nothing
 * would ever retry those rows. Each job's own adapters are used with its own notification
 * config, grouped by provider exactly like a pipeline run, so the backend cannot tell a
 * retry from a fresh find.
 *
 * Bounded retries: a row is sent at most twice ever (see `enrichment_requests`), at least a
 * day apart. Retries mint duplicate backend rows - the backend converges by URL, not
 * exactly-once - and the bound caps how many copies of one listing may exist. Unpriced
 * rows are never selected: no enrichment could score them, so sending would only mint
 * duplicates for nothing.
 *
 * Stamped only after the webhook answered success. A throw means the backend never saw the
 * row, so it stays eligible for the next run rather than burning one of its two sends.
 *
 * Never throws: a failed hour costs nothing but an hour, which must not take the scheduler
 * down with it.
 *
 * @param {Object} [options]
 * @param {number} [options.now=Date.now()] - Injectable clock for tests.
 * @returns {Promise<{jobs: number, requested: number, failed: number}>}
 */
export async function runEnrichmentCatchup({ now = Date.now() } = {}) {
  const summary = { jobs: 0, requested: 0, failed: 0 };
  let jobs;
  try {
    jobs = getJobs({ includeDisabled: false }) ?? [];
  } catch (err) {
    logger.warn('Enrichment catch-up failed to list jobs', err);
    return summary;
  }
  const baseUrl = (await getSettings())?.baseUrl ?? '';

  for (const job of jobs) {
    const notificationConfig = job?.notificationAdapter ?? [];
    if (!Array.isArray(notificationConfig) || notificationConfig.length === 0) {
      continue;
    }
    let rows;
    try {
      rows = getUnenrichedListingsForCatchup(job.id, { limit: CATCHUP_LIMIT_PER_JOB, now }) ?? [];
    } catch (err) {
      logger.warn(`Enrichment catch-up failed to select rows for job '${job.id}'`, err);
      continue;
    }
    if (rows.length === 0) continue;
    summary.jobs += 1;

    const language = getUserSettings(job.userId)?.language ?? 'en';
    const byProvider = new Map();
    for (const row of rows) {
      const providerId = row?.provider ?? 'unknown';
      if (!byProvider.has(providerId)) byProvider.set(providerId, []);
      byProvider.get(providerId).push(row);
    }

    for (const [providerId, group] of byProvider) {
      const formatted = group.map((row) =>
        formatListing(
          {
            id: row.hash ?? row.id,
            link: row.link,
            title: row.title,
            price: row.price,
            size: row.size,
            rooms: row.rooms,
            address: row.address,
            description: row.description,
            image: row.image_url,
            provider: row.provider,
          },
          language,
        ),
      );
      try {
        await Promise.all(send(providerId, formatted, notificationConfig, job.id, baseUrl));
        stampEnrichmentRequested(
          group.map((row) => row.id),
          now,
        );
        summary.requested += group.length;
      } catch (err) {
        logger.warn(`Enrichment catch-up send failed for job '${job.id}' (provider '${providerId}')`, err);
        summary.failed += group.length;
      }
    }
  }

  if (summary.requested > 0 || summary.failed > 0) {
    logger.info(
      `Enrichment catch-up: ${summary.requested} listing(s) re-requested across ${summary.jobs} job(s)` +
        (summary.failed > 0 ? `, ${summary.failed} failed` : ''),
    );
  }
  return summary;
}

/**
 * Schedule the hourly enrichment catch-up.
 *
 * Runs once on start as well: a process that was down over a weekend comes back to rows that
 * missed enrichment while it was away, and the sends are cheap, bounded POSTs - unlike the
 * travel-time and price-tracking sweeps there is nothing here a restart must hold back from.
 *
 * @returns {Promise<void>}
 */
export async function initEnrichmentCatchupCron() {
  await runEnrichmentCatchup();
  cron.schedule(ENRICHMENT_CATCHUP_CRON, runEnrichmentCatchup);
}
