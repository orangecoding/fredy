/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import restana from 'restana';
import * as listingStorage from '../../services/storage/listingsStorage.js';
import * as watchListStorage from '../../services/storage/watchListStorage.js';
import { isAdmin as isAdminFn } from '../security.js';
import logger from '../../services/logger.js';
import { nullOrEmpty } from '../../utils.js';
import { getJobs } from '../../services/storage/jobStorage.js';

const service = restana();

const listingsRouter = service.newRouter();

listingsRouter.get('/table', async (req, res) => {
  const {
    page,
    pageSize = 50,
    activityFilter,
    jobNameFilter,
    providerFilter,
    watchListFilter,
    sortfield = null,
    sortdir = 'asc',
    freeTextFilter,
  } = req.query || {};

  // normalize booleans (accept true, 'true', 1, '1' for true; false, 'false', 0, '0' for false)
  const toBool = (v) => {
    if (v === true || v === 'true' || v === 1 || v === '1') return true;
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return null;
  };
  const normalizedActivity = toBool(activityFilter);
  const normalizedWatch = toBool(watchListFilter);

  let jobFilter = null;
  let jobIdFilter = null;
  const jobs = getJobs();
  if (!nullOrEmpty(jobNameFilter)) {
    const job = jobs.find((j) => j.id === jobNameFilter);
    jobFilter = job != null ? job.name : null;
    jobIdFilter = job != null ? job.id : null;
  }

  res.body = listingStorage.queryListings({
    page: page ? parseInt(page, 10) : 1,
    pageSize: pageSize ? parseInt(pageSize, 10) : 50,
    freeTextFilter: freeTextFilter || null,
    activityFilter: normalizedActivity,
    jobNameFilter: jobFilter,
    jobIdFilter: jobIdFilter,
    providerFilter,
    watchListFilter: normalizedWatch,
    sortField: sortfield || null,
    sortDir: sortdir === 'desc' ? 'desc' : 'asc',
    userId: req.session.currentUser,
    isAdmin: isAdminFn(req),
  });
  res.send();
});

listingsRouter.get('/map', async (req, res) => {
  const { jobId, minPrice, maxPrice } = req.query || {};

  res.body = listingStorage.getListingsForMap({
    jobId: nullOrEmpty(jobId) ? null : jobId,
    minPrice: minPrice ? parseInt(minPrice, 10) : null,
    maxPrice: maxPrice ? parseInt(maxPrice, 10) : null,
    userId: req.session.currentUser,
    isAdmin: isAdminFn(req),
  });
  res.send();
});

// Toggle watch state for the current user on a listing
listingsRouter.post('/watch', async (req, res) => {
  try {
    const { listingId } = req.body || {};
    const userId = req.session?.currentUser;
    if (!listingId || !userId) {
      res.statusCode = 400;
      res.body = { message: 'listingId or user not provided' };
      return res.send();
    }
    watchListStorage.toggleWatch(listingId, userId);
  } catch (error) {
    logger.error(error);
    res.statusCode = 500;
    res.body = { message: 'Failed to toggle watch' };
  }
  res.send();
});

listingsRouter.delete('/job', async (req, res) => {
  const { jobId } = req.body;
  try {
    listingStorage.deleteListingsByJobId(jobId);
  } catch (error) {
    res.send(new Error(error));
    logger.error(error);
  }
  res.send();
});

listingsRouter.delete('/', async (req, res) => {
  const { ids } = req.body;
  try {
    if (Array.isArray(ids) && ids.length > 0) {
      listingStorage.deleteListingsById(ids);
    }
  } catch (error) {
    res.send(new Error(error));
    logger.error(error);
  }
  res.send();
});

export { listingsRouter };
