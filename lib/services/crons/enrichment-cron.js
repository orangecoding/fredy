/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import { getJobs } from '../storage/jobStorage.js';
import { getUnenrichedListingsForCatchup, stampEnrichmentRequested } from '../storage/listingsStorage.js';
import { enrichListing } from '../enrichment/enrichListing.js';
import logger from '../logger.js';

/**
 * Hourly, at quarter to - offset from the webhook catch-up (:30) and the other crons so a
 * restart does not fire everything in the same minute.
 * @type {string}
 */
const LOCAL_ENRICHMENT_CRON = '45 * * * *';

/**
 * Score unscored listings locally, in Fredy, with no backend involved.
 *
 * This is the enrichment path since the scoring backend was removed: the webhook catch-up
 * cron can only re-send rows to adapters that no longer exist, so rows it selects would
 * wait forever. This cron selects all of a job's scoreless rows (priced, fewer than two
 * attempts, oldest first) and runs the local port of the backend pipeline - Mietspiegel
 * seed, rough commute, GREIX growth lookup, scorer - writing back through the same
 * zero-clobber writer. There is deliberately no per-run cap: everything here is local
 * CPU (no network, no backend copies minted), so a backlog of hundreds of rows costs
 * milliseconds, not hours. A row is stamped only when its run produced scores, so a throw
 * keeps it eligible instead of burning one of its two attempts.
 *
 * Never throws: a failed hour costs nothing but an hour, which must not take the scheduler
 * down with it.
 *
 * @param {Object} [options]
 * @param {number} [options.now=Date.now()] - Injectable clock for tests.
 * @returns {Promise<{jobs: number, enriched: number, failed: number}>}
 */
export async function runLocalEnrichment({ now = Date.now() } = {}) {
  const summary = { jobs: 0, enriched: 0, failed: 0 };
  let jobs;
  try {
    jobs = getJobs({ includeDisabled: false }) ?? [];
  } catch (err) {
    logger.warn('Local enrichment failed to list jobs', err);
    return summary;
  }

  const seen = new Set();
  for (const job of jobs) {
    let rows;
    try {
      rows = getUnenrichedListingsForCatchup(job.id, { now }) ?? [];
    } catch (err) {
      logger.warn(`Local enrichment failed to select rows for job '${job.id}'`, err);
      continue;
    }
    const fresh = rows.filter((row) => row?.id != null && !seen.has(row.id));
    if (fresh.length === 0) continue;
    summary.jobs += 1;

    const done = [];
    for (const row of fresh) {
      seen.add(row.id);
      try {
        const scores = await enrichListing(row);
        if (scores == null) {
          summary.failed += 1;
        } else {
          done.push(row.id);
          summary.enriched += 1;
        }
      } catch (err) {
        logger.warn(`Local enrichment failed for listing '${row.id}'`, err);
        summary.failed += 1;
      }
    }
    if (done.length > 0) {
      try {
        stampEnrichmentRequested(done, now);
      } catch (err) {
        logger.warn(`Local enrichment failed to stamp rows for job '${job.id}'`, err);
      }
    }
  }

  if (summary.enriched > 0 || summary.failed > 0) {
    logger.info(
      `Local enrichment: ${summary.enriched} listing(s) scored across ${summary.jobs} job(s)` +
        (summary.failed > 0 ? `, ${summary.failed} failed` : ''),
    );
  }
  return summary;
}

/**
 * Schedule the hourly local enrichment.
 *
 * Runs once on start as well: a fresh deploy lands on the backlog the dead-backend era
 * left behind, and local lookups cost nothing but CPU - unlike the travel-time and
 * price-tracking sweeps there is nothing here a restart must hold back from.
 *
 * @returns {Promise<void>}
 */
export async function initLocalEnrichmentCron() {
  await runLocalEnrichment();
  cron.schedule(LOCAL_ENRICHMENT_CRON, runLocalEnrichment);
}
