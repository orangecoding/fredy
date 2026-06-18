/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as listingStorage from '../../services/storage/listingsStorage.js';
import * as watchListStorage from '../../services/storage/watchListStorage.js';
import { isAdmin as isAdminFn } from '../security.js';
import logger from '../../services/logger.js';
import { nullOrEmpty } from '../../utils.js';
import { getJob } from '../../services/storage/jobStorage.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import { initSimilarityCache } from '../../services/similarity-check/similarityCache.js';
import { translate as deeplTranslate } from '../../services/translation/deeplClient.js';
import { getAllDirections as orsGetAllDirections } from '../../services/routing/orsClient.js';
import { getUserSettings } from '../../services/storage/settingsStorage.js';

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
      statusFilter,
      hiddenOnly,
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
    const normalizedHidden = toBool(hiddenOnly) === true;
    const allowedStatuses = ['applied', 'rejected', 'accepted', 'none'];
    const normalizedStatus =
      typeof statusFilter === 'string' && allowedStatuses.includes(statusFilter.toLowerCase())
        ? statusFilter.toLowerCase()
        : undefined;

    let jobFilter = null;
    let jobIdFilter = null;
    if (!nullOrEmpty(jobNameFilter)) {
      const job = getJob(jobNameFilter);
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
      statusFilter: normalizedStatus,
      hiddenOnly: normalizedHidden,
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

  fastify.post('/:listingId/notes', async (request, reply) => {
    const { listingId } = request.params || {};
    const { notes } = request.body || {};
    const userId = request.session?.currentUser;
    if (!listingId || !userId) {
      return reply.code(400).send({ message: 'listingId or user not provided' });
    }
    try {
      const changes = listingStorage.setListingNotes(listingId, typeof notes === 'string' ? notes : null);
      if (changes === 0) {
        return reply.code(404).send({ message: 'Listing not found' });
      }
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Failed to update listing notes' });
    }

    await trackPoi(TRACKING_POIS.NOTES_CREATE);
    return reply.send();
  });

  fastify.post('/:listingId/status', async (request, reply) => {
    const { listingId } = request.params || {};
    const { status } = request.body || {};
    const userId = request.session?.currentUser;
    if (!listingId || !userId) {
      return reply.code(400).send({ message: 'listingId or user not provided' });
    }
    const allowed = ['applied', 'rejected', 'accepted'];
    const normalized = status == null ? null : String(status).toLowerCase();
    if (normalized != null && !allowed.includes(normalized)) {
      return reply.code(400).send({ message: `Invalid status: ${status}` });
    }
    try {
      const changes = listingStorage.setListingStatus(listingId, normalized);
      await trackPoi(TRACKING_POIS.USING_LISTING_STATUS);
      if (changes === 0) {
        return reply.code(404).send({ message: 'Listing not found' });
      }
      if (normalized != null) {
        watchListStorage.ensureWatch(listingId, userId);
      }
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Failed to update listing status' });
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
      const job = getJob(jobId);
      if (!job) {
        return reply.code(404).send({ error: 'Job not found' });
      }
      const userId = request.session.currentUser;
      if (!isAdminFn(request) && job.userId !== userId && !job.shared_with_user.includes(userId)) {
        return reply
          .code(403)
          .send({ error: 'You are trying to remove listings for a job that is not associated to your user' });
      }
      listingStorage.deleteListingsByJobId(jobId, hardDelete);
      if (hardDelete) initSimilarityCache();
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });

  fastify.delete('/', async (request, reply) => {
    const { ids, hardDelete = false } = request.body;
    const settings = await getSettings();
    try {
      if (settings.demoMode && !isAdminFn(request)) {
        return reply.code(403).send({ error: 'Sorry, but you cannot remove listings in demo mode ;)' });
      }
      if (Array.isArray(ids) && ids.length > 0) {
        listingStorage.deleteListingsById(ids, hardDelete);
        if (hardDelete) initSimilarityCache();
      }
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });

  fastify.post('/:listingId/translate', async (request, reply) => {
    const { listingId } = request.params;
    const { targetLanguage } = request.body || {};

    if (!targetLanguage) {
      return reply.code(400).send({ error: 'targetLanguage is required' });
    }

    const settings = await getSettings();
    if (!settings.deepl_api_key) {
      return reply.code(400).send({ error: 'DeepL API key not configured' });
    }

    try {
      const listing = listingStorage.getListingById(listingId, request.session.currentUser, isAdminFn(request));
      if (!listing) {
        return reply.code(404).send({ error: 'Listing not found' });
      }

      if (!listing.description) {
        return reply.code(400).send({ error: 'Listing has no description to translate' });
      }

      const translations = listing.translations ? JSON.parse(listing.translations) : {};
      const lang = targetLanguage.toLowerCase();
      if (translations[lang]) {
        return reply.send({ text: translations[lang], cached: true });
      }

      const translated = await deeplTranslate(
        listing.description,
        targetLanguage.toUpperCase(),
        settings.deepl_api_key,
      );
      listingStorage.setListingTranslation(listingId, lang, translated);
      return reply.send({ text: translated, cached: false });
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/:listingId/commute', async (request, reply) => {
    const { listingId } = request.params;

    const settings = await getSettings();
    if (!settings.ors_api_key) {
      return reply.code(400).send({ error: 'ORS API key not configured' });
    }

    try {
      const listing = listingStorage.getListingById(listingId, request.session.currentUser, isAdminFn(request));
      if (!listing) return reply.code(404).send({ error: 'Listing not found' });
      if (!listing.latitude || listing.latitude === -1) {
        return reply.code(400).send({ error: 'Listing has no coordinates' });
      }

      const userSettings = getUserSettings(request.session.currentUser);
      const destination = userSettings?.home_address?.coords;
      if (!destination) {
        return reply.code(400).send({ error: 'No commute destination set in user settings' });
      }

      const result = await orsGetAllDirections(
        listing.longitude,
        listing.latitude,
        destination.lng,
        destination.lat,
        settings.ors_api_key,
      );
      return reply.send(result);
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/restore', async (request, reply) => {
    const { ids } = request.body || {};
    const settings = await getSettings();
    try {
      if (settings.demoMode && !isAdminFn(request)) {
        return reply.code(403).send({ error: 'Sorry, but you cannot restore listings in demo mode ;)' });
      }
      if (Array.isArray(ids) && ids.length > 0) {
        listingStorage.restoreListingsById(ids);
      }
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });
}
