/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as listingStorage from '../../services/storage/listingsStorage.js';
import * as watchListStorage from '../../services/storage/watchListStorage.js';
import { isAdmin as isAdminFn } from '../security.js';
import logger from '../../services/logger.js';
import { nullOrEmpty } from '../../utils.js';
import { getJobs } from '../../services/storage/jobStorage.js';
import { getSettings } from '../../services/storage/settingsStorage.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function listingsPlugin(fastify) {
  fastify.get('/table', async (request) => {
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
    } = request.query || {};

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

    return listingStorage.queryListings({
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
      userId: request.session.currentUser,
      isAdmin: isAdminFn(request),
    });
  });

  fastify.get('/map', async (request) => {
    const { jobId } = request.query || {};
    return listingStorage.getListingsForMap({
      jobId: nullOrEmpty(jobId) ? null : jobId,
      userId: request.session.currentUser,
      isAdmin: isAdminFn(request),
    });
  });

  fastify.get('/:listingId', async (request, reply) => {
    const { listingId } = request.params;
    const listing = listingStorage.getListingById(listingId, request.session.currentUser, isAdminFn(request));
    if (!listing) {
      return reply.code(404).send({ message: 'Listing not found' });
    }
    return listing;
  });

  fastify.post('/watch', async (request, reply) => {
    try {
      const { listingId } = request.body || {};
      const userId = request.session?.currentUser;
      if (!listingId || !userId) {
        return reply.code(400).send({ message: 'listingId or user not provided' });
      }
      watchListStorage.toggleWatch(listingId, userId);
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Failed to toggle watch' });
    }
    return reply.send();
  });

  fastify.delete('/job', async (request, reply) => {
    const { jobId, hardDelete = false } = request.body;
    const settings = await getSettings();
    try {
      if (settings.demoMode && !isAdminFn(request)) {
        return reply.code(403).send({ error: 'Sorry, but you cannot remove listings in demo mode ;)' });
      }
      listingStorage.deleteListingsByJobId(jobId, hardDelete);
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });

  fastify.delete('/', async (request, reply) => {
    const { ids, hardDelete = false } = request.body;
    try {
      if (Array.isArray(ids) && ids.length > 0) {
        listingStorage.deleteListingsById(ids, hardDelete);
      }
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });
}
