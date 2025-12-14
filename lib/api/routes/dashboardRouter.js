/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import restana from 'restana';
import * as jobStorage from '../../services/storage/jobStorage.js';
import * as userStorage from '../../services/storage/userStorage.js';
import { getListingsKpisForJobIds, getProviderDistributionForJobIds } from '../../services/storage/listingsStorage.js';
import { getSettings } from '../../services/storage/settingsStorage.js';

const service = restana();
export const dashboardRouter = service.newRouter();

function isAdmin(req) {
  const user = req.session?.currentUser ? userStorage.getUser(req.session.currentUser) : null;
  return !!user?.isAdmin;
}

function getAccessibleJobs(req) {
  const currentUser = req.session.currentUser;
  const admin = isAdmin(req);
  return jobStorage
    .getJobs()
    .filter((job) => admin || job.userId === currentUser || job.shared_with_user.includes(currentUser));
}

function cap(val) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

dashboardRouter.get('/', async (req, res) => {
  const jobs = getAccessibleJobs(req);
  const settings = await getSettings();

  // KPIs
  const totalJobs = jobs.length;
  const totalListings = jobs.reduce((sum, j) => sum + (j.numberOfFoundListings || 0), 0);
  const jobIds = jobs.map((j) => j.id);
  const { numberOfActiveListings, avgPriceOfListings } = getListingsKpisForJobIds(jobIds);
  // Build Pie data in a simple shape the frontend can consume directly
  // Shape: { labels: string[], values: number[] } with values as percentages
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

  res.body = {
    general: {
      interval: settings.interval,
      lastRun: settings.lastRun || null,
      nextRun: settings.lastRun == null ? 0 : settings.lastRun + settings.interval * 60000,
    },
    kpis: {
      totalJobs,
      totalListings,
      numberOfActiveListings,
      avgPriceOfListings,
    },
    pie: providerPie,
  };
  res.send();
});
