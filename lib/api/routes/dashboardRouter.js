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

    return {
      general: {
        interval: settings.interval,
        lastRun: settings.lastRun || null,
        nextRun: settings.lastRun == null ? 0 : settings.lastRun + settings.interval * 60000,
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
