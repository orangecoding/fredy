/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as jobStorage from '../../services/storage/jobStorage.js';
import { getListingsKpisForJobIds, getProviderDistributionForJobIds } from '../../services/storage/listingsStorage.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import { isAdmin } from '../security.js';

function getAccessibleJobs(request) {
  const currentUser = request.session.currentUser;
  const admin = isAdmin(request);
  return jobStorage
    .getJobs()
    .filter((job) => admin || job.userId === currentUser || job.shared_with_user.includes(currentUser));
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
      pie: providerPie,
    };
  });
}
