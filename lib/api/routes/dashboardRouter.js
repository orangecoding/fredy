/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as jobStorage from '../../services/storage/jobStorage.js';
import {
  getListingsKpisForJobIds,
  getListingsPerDayForJobIds,
  getProviderDistributionForJobIds,
} from '../../services/storage/listingsStorage.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import { canAccessJob } from '../../services/security/access.js';

/** Two weeks: long enough to show a shape, short enough to stay readable as a sparkline. */
const TREND_DAYS = 14;

/**
 * Jobs the requesting user may see: their own, ones shared with them, and everything for admins.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {Object[]}
 */
function getAccessibleJobs(request) {
  return jobStorage.getJobs().filter((job) => canAccessJob(request.currentUser, job));
}

function cap(val) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

/**
 * Compute the most recent job trigger timestamp across the given jobs.
 *
 * Returns `null` when none of the jobs has ever been triggered. The value is
 * persisted per-job via `jobs.last_run_at`, so the dashboard reflects the
 * scope visible to the current user (own + shared, or all for admins) rather
 * than a process-wide in-memory value.
 *
 * @param {Array<{lastRunAt?: number|null}>} jobs
 * @returns {number|null}
 */
function computeLastRun(jobs) {
  let lastRun = null;
  for (const job of jobs) {
    const ts = job.lastRunAt;
    if (typeof ts === 'number' && (lastRun == null || ts > lastRun)) {
      lastRun = ts;
    }
  }
  return lastRun;
}

/**
 * Compare the most recent seven days against the seven before them.
 *
 * A standing total says nothing about whether the search is still working. The change against
 * the previous week is the smallest honest answer to "is this still finding anything".
 *
 * `changePct` is null rather than 0 when the previous week found nothing: going from 0 to 5 is
 * not a percentage increase, and rendering it as one would be a lie the UI cannot detect.
 *
 * @param {Array<{count: number}>} perDay Oldest first, at least 14 entries.
 * @returns {{thisWeek: number, previousWeek: number, changePct: number|null}}
 */
function compareWeeks(perDay) {
  const sum = (rows) => rows.reduce((total, row) => total + (Number(row.count) || 0), 0);
  const thisWeek = sum(perDay.slice(-7));
  const previousWeek = sum(perDay.slice(-14, -7));
  return {
    thisWeek,
    previousWeek,
    changePct: previousWeek > 0 ? Math.round(((thisWeek - previousWeek) / previousWeek) * 100) : null,
  };
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function dashboardPlugin(fastify) {
  fastify.get('/', async (request) => {
    const jobs = getAccessibleJobs(request);
    const settings = await getSettings();

    const totalJobs = jobs.length;
    const totalListings = jobs.reduce((sum, j) => sum + (j.numberOfFoundListings || 0), 0);
    const jobIds = jobs.map((j) => j.id);
    const { numberOfActiveListings, medianPriceOfListings } = getListingsKpisForJobIds(jobIds);

    const providerPieRaw = getProviderDistributionForJobIds(jobIds);
    const providerPie = Array.isArray(providerPieRaw)
      ? {
          labels: providerPieRaw.map((p) => cap(p.type)),
          values: providerPieRaw.map((p) => Number(p.value) || 0),
        }
      : providerPieRaw && typeof providerPieRaw === 'object'
        ? {
            labels: Array.isArray(providerPieRaw.labels) ? providerPieRaw.labels : [],
            values: Array.isArray(providerPieRaw.values) ? providerPieRaw.values : [],
          }
        : { labels: [], values: [] };

    const lastRun = computeLastRun(jobs);
    const perDay = getListingsPerDayForJobIds(jobIds, TREND_DAYS);

    return {
      general: {
        interval: settings.interval,
        lastRun,
        nextRun: lastRun == null ? 0 : lastRun + settings.interval * 60000,
      },
      kpis: {
        totalJobs,
        totalListings,
        numberOfActiveListings,
        medianPriceOfListings,
      },
      trend: {
        perDay,
        ...compareWeeks(perDay),
      },
      pie: providerPie,
    };
  });
}
