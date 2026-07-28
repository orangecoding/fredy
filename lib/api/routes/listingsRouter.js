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
import { getSettings, getUserSettings } from '../../services/storage/settingsStorage.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import { affordabilityBandFor } from '../../services/finance/listingFilter.js';
import { thresholdsFor, verdictForListing } from '../../services/finance/affordability.js';
import { canAccessJob } from '../../services/security/access.js';

/**
 * Deliberately identical for "listing does not exist" and "listing belongs to someone else", so the
 * response cannot be used to probe which ids are real.
 */
const NO_ACCESS_MESSAGE = 'You are trying to access a listing that is not associated to your user';

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
      affordabilityFilter,
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

    // Affordability is derived server-side from the user's stored profile, never from the
    // request, so a hand-edited or bookmarked URL cannot inject its own price bounds. An
    // incomplete profile yields no band at all, which means the filter is ignored rather than
    // returning an empty page.
    //
    // This is the hottest endpoint in the app, so the settings row is read exactly once per
    // request and serves both the filter's band and the per-row verdicts below.
    const userId = request.session.currentUser;
    const financeProfile = getUserSettings(userId)?.finance_profile ?? null;
    const affordabilityBand = nullOrEmpty(affordabilityFilter)
      ? null
      : affordabilityBandFor(affordabilityFilter, financeProfile);

    // Each row carries its own affordability verdict, computed here against that same profile.
    // The UI used to derive it in the browser from a copy of the finance modules; it now only
    // renders what the server decided, so the chip on a row and the filter that returned it can
    // never disagree. Without a profile there are no thresholds and every verdict is null, which
    // is what hides the chips.
    const thresholds = financeProfile == null ? null : thresholdsFor(financeProfile);
    const withVerdict = (page) =>
      thresholds == null
        ? page
        : {
            ...page,
            result: page.result.map((listing) => ({
              ...listing,
              affordabilityVerdict: verdictForListing(listing.price, listing.dealType, thresholds),
            })),
          };

    return withVerdict(
      listingStorage.queryListings({
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
        affordabilityBand,
        userId,
        isAdmin: isAdminFn(request),
      }),
    );
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
    const userId = request.session.currentUser;
    const listing = listingStorage.getListingById(listingId, userId, isAdminFn(request));
    if (!listing) {
      return reply.code(404).send({ message: 'Listing not found' });
    }
    // Same server-side verdict the overview rows carry, so the detail page agrees with the row
    // the user clicked without deriving anything itself.
    const thresholds = thresholdsFor(getUserSettings(userId)?.finance_profile ?? null);
    return { ...listing, affordabilityVerdict: verdictForListing(listing.price, listing.dealType, thresholds) };
  });

  fastify.post('/watch', async (request, reply) => {
    try {
      const { listingId } = request.body || {};
      const userId = request.session?.currentUser;
      if (!listingId || !userId) {
        return reply.code(400).send({ message: 'listingId or user not provided' });
      }
      if (!listingStorage.userCanAccessListing(listingId, userId, isAdminFn(request))) {
        return reply.code(403).send({ message: NO_ACCESS_MESSAGE });
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
    if (!listingStorage.userCanAccessListing(listingId, userId, isAdminFn(request))) {
      return reply.code(403).send({ message: NO_ACCESS_MESSAGE });
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
    if (!listingStorage.userCanAccessListing(listingId, userId, isAdminFn(request))) {
      return reply.code(403).send({ message: NO_ACCESS_MESSAGE });
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
      if (!canAccessJob(request.currentUser, job)) {
        return reply
          .code(403)
          .send({ error: 'You are trying to remove listings for a job that is not associated to your user' });
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
    const settings = await getSettings();
    try {
      if (settings.demoMode && !isAdminFn(request)) {
        return reply.code(403).send({ error: 'Sorry, but you cannot remove listings in demo mode ;)' });
      }
      if (Array.isArray(ids) && ids.length > 0) {
        const allowed = listingStorage.filterListingIdsForUser(ids, request.session.currentUser, isAdminFn(request));
        // All-or-nothing: a request that names even one foreign listing is rejected outright rather
        // than silently deleting the part the user happened to own. hardDelete is irreversible, so a
        // partial success would be impossible to reason about afterwards.
        if (allowed.length !== new Set(ids).size) {
          return reply.code(403).send({ error: NO_ACCESS_MESSAGE });
        }
        listingStorage.deleteListingsById(allowed, hardDelete);
      }
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });

  fastify.post('/restore', async (request, reply) => {
    const { ids } = request.body || {};
    const settings = await getSettings();
    try {
      if (settings.demoMode && !isAdminFn(request)) {
        return reply.code(403).send({ error: 'Sorry, but you cannot restore listings in demo mode ;)' });
      }
      if (Array.isArray(ids) && ids.length > 0) {
        const allowed = listingStorage.filterListingIdsForUser(ids, request.session.currentUser, isAdminFn(request));
        if (allowed.length !== new Set(ids).size) {
          return reply.code(403).send({ error: NO_ACCESS_MESSAGE });
        }
        listingStorage.restoreListingsById(allowed);
      }
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });
}
