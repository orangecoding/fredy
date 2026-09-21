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
import { normalizeListingFilters } from '../listingFilterQuery.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import { thresholdsFor, verdictForListing } from '../../services/finance/affordability.js';
import { canAccessJob } from '../../services/security/access.js';
import { updateDistancesForListing } from '../../services/geocoding/distanceService.js';
import { geocodeAddress, isGeocodingPaused } from '../../services/geocoding/geoCodingService.js';
import { getCountriesForListing } from '../../services/providers/providerCountries.js';
import { SCAM_OVERRIDES } from '../../services/listings/scamSignals.js';
import { buildApplicationLetter } from '../../services/application/applicationService.js';
import { refetchListingDetailsOnce } from '../../services/listings/detailRefetchService.js';

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
    const { page, pageSize = 50, sortfield = null, sortdir = 'asc' } = request.query || {};

    // This is the hottest endpoint in the app, so the settings row is read exactly once per
    // request and serves both the filter's affordability band and the per-row verdicts below.
    const userId = request.session.currentUser;
    const { filters, financeProfile } = normalizeListingFilters(request.query, {
      userId,
      isAdmin: isAdminFn(request),
    });

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

    const pageData = listingStorage.queryListings({
      ...filters,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 50,
      sortField: sortfield || null,
      sortDir: sortdir === 'desc' ? 'desc' : 'asc',
    });

    const availableProviders =
      typeof listingStorage.getAvailableProviders === 'function'
        ? listingStorage.getAvailableProviders({
            jobId: filters.jobIdFilter,
            jobName: filters.jobNameFilter,
            userId,
            isAdmin: filters.isAdmin,
            hiddenOnly: filters.hiddenOnly,
          })
        : [];

    return withVerdict({
      ...pageData,
      availableProviders,
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

  /**
   * Draft an application letter for one listing.
   *
   * Rendered here rather than in the browser for two reasons. The language follows the portal's
   * country, and narrowing a multi-country provider runs `metaInformation.countryOf`, a function
   * that cannot cross the wire. And the MCP tool answers from this same service, so the letter a
   * user copies out of the dialog and the one an assistant hands them are the same text rather
   * than two implementations drifting apart.
   *
   * The round trip costs the copy dialog nothing: it fetches when it opens, and the clipboard
   * write happens later, on the user's own click.
   */
  fastify.get('/:listingId/application', async (request, reply) => {
    const { listingId } = request.params;
    const userId = request.session?.currentUser;
    if (!listingId || !userId) {
      return reply.code(400).send({ message: 'listingId or user not provided' });
    }

    // Geometry is a polyline decode per address that this route has no use for.
    const listing = listingStorage.getListingById(listingId, userId, isAdminFn(request), { includeGeometry: false });
    if (!listing) {
      return reply.code(404).send({ message: 'Listing not found' });
    }

    try {
      const letter = await buildApplicationLetter(listing, userId, { language: request.query?.language ?? null });
      await trackPoi(TRACKING_POIS.APPLICATION_LETTER_DRAFTED);
      return letter;
    } catch (error) {
      logger.error('Error building an application letter', error);
      return reply.code(500).send({ message: error.message });
    }
  });

  fastify.get('/:listingId/priceHistory', async (request, reply) => {
    const { listingId } = request.params;
    const userId = request.session?.currentUser;
    if (!listingId || !userId) {
      return reply.code(400).send({ message: 'listingId or user not provided' });
    }
    // Same access gate as every other per-listing route: a listing id is guessable, and the price
    // history of somebody else's search is still somebody else's data.
    if (!listingStorage.userCanAccessListing(listingId, userId, isAdminFn(request))) {
      return reply.code(403).send({ message: NO_ACCESS_MESSAGE });
    }
    return listingStorage.getPriceHistory(listingId);
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

  /*
   * Overwrite the address a portal reported with one the user picked, coordinates included.
   *
   * The coordinates are required rather than geocoded here: the caller has already resolved them,
   * either through the address search or by dropping a pin, and doing it again would mean a second
   * Nominatim call and a second chance to disagree with what the user was shown.
   */
  fastify.post('/:listingId/address', async (request, reply) => {
    const { listingId } = request.params || {};
    const { address, latitude, longitude } = request.body || {};
    const userId = request.session?.currentUser;
    if (!listingId || !userId) {
      return reply.code(400).send({ message: 'listingId or user not provided' });
    }

    const trimmed = typeof address === 'string' ? address.trim() : '';
    if (trimmed.length === 0 || trimmed.length > 512) {
      return reply.code(400).send({ message: 'A valid address is required' });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    // -1/-1 is the geocoder's "looked, found nothing" marker. It must never be stored as a
    // position, or the listing would claim to sit off the coast of Africa.
    const coordsInvalid =
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180 ||
      (lat === -1 && lng === -1);
    if (coordsInvalid) {
      return reply.code(400).send({ message: 'Valid coordinates are required' });
    }

    const settings = await getSettings();
    if (settings.demoMode && !isAdminFn(request)) {
      return reply.code(403).send({ error: 'Sorry, but you cannot change addresses in demo mode ;)' });
    }

    if (!listingStorage.userCanAccessListing(listingId, userId, isAdminFn(request))) {
      return reply.code(403).send({ message: NO_ACCESS_MESSAGE });
    }

    try {
      const listing = listingStorage.getListingById(listingId, userId, isAdminFn(request));
      if (!listing) {
        return reply.code(404).send({ message: 'Listing not found' });
      }

      const changes = listingStorage.setListingAddress(listingId, trimmed, lat, lng);
      if (changes === 0) {
        return reply.code(404).send({ message: 'Listing not found' });
      }

      // Distances are measured against the reference addresses of whoever owns the job, which is
      // not necessarily whoever is looking at the listing - jobs can be shared.
      const ownerUserId = getJob(listing.job_id)?.userId;
      if (ownerUserId) {
        updateDistancesForListing(listingId, lat, lng, ownerUserId);
      }

      await trackPoi(TRACKING_POIS.LISTING_ADDRESS_MANUAL);
      // The refreshed listing goes back with the response so the detail view can redraw without a
      // second round trip.
      return reply.send(listingStorage.getListingById(listingId, userId, isAdminFn(request)));
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Failed to update listing address' });
    }
  });

  /*
   * Look up one listing's coordinates again, now.
   *
   * Geocoding at scrape time is best effort: a timeout or a rate limit leaves the listing with no
   * coordinates, and until now the only thing that would try again was the six-hourly sweep. People
   * found their own way round that by opening Settings and pressing Save, which happens to kick the
   * sweep off (issue #418). This is that, made deliberate and narrowed to the one listing being
   * looked at.
   *
   * Answers with a state rather than an error, because "we could not reach the geocoder" and "there
   * is no such place" need opposite things from the user: wait, or fix the address by hand.
   */
  fastify.post('/:listingId/geocode', async (request, reply) => {
    const { listingId } = request.params || {};
    const userId = request.session?.currentUser;
    if (!listingId || !userId) {
      return reply.code(400).send({ message: 'listingId or user not provided' });
    }

    const settings = await getSettings();
    if (settings.demoMode && !isAdminFn(request)) {
      return reply.code(403).send({ error: 'Sorry, but you cannot change addresses in demo mode ;)' });
    }

    if (!listingStorage.userCanAccessListing(listingId, userId, isAdminFn(request))) {
      return reply.code(403).send({ message: NO_ACCESS_MESSAGE });
    }

    try {
      const listing = listingStorage.getListingById(listingId, userId, isAdminFn(request));
      if (!listing) {
        return reply.code(404).send({ message: 'Listing not found' });
      }
      if (nullOrEmpty(listing.address)) {
        return reply.send({ status: 'noAddress' });
      }
      // Nothing to retry: the user placed this one themselves, and re-deriving it from the portal's
      // address text would quietly move their pin.
      if (listing.address_is_manual) {
        return reply.send({ status: 'manual' });
      }
      // Asked before the request rather than inferred from a null afterwards, so a stood-off
      // geocoder cannot be reported to the user as an address that does not exist.
      if (isGeocodingPaused()) {
        return reply.send({ status: 'unavailable' });
      }

      const coords = await geocodeAddress(listing.address, await getCountriesForListing(listing.provider, listing));
      if (coords == null) {
        return reply.send({ status: 'unavailable' });
      }
      if (coords.lat === -1 || coords.lng === -1) {
        return reply.send({ status: 'notFound' });
      }

      listingStorage.updateListingGeocoordinates(listingId, coords.lat, coords.lng);
      const ownerUserId = getJob(listing.job_id)?.userId;
      if (ownerUserId) {
        updateDistancesForListing(listingId, coords.lat, coords.lng, ownerUserId);
      }

      // The refreshed listing rides back with the answer so the detail view can draw the map without
      // a second round trip, the same way the manual address endpoint above does.
      return reply.send({
        status: 'found',
        listing: listingStorage.getListingById(listingId, userId, isAdminFn(request)),
      });
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Failed to look up the coordinates of this listing' });
    }
  });

  /**
   * Fetch one listing's detail page now, whatever the bulk enrichment setting says.
   *
   * `provider_details` governs the pipeline, which visits every newly found listing of every job on
   * a schedule - traffic a portal notices. This is one person asking for one exposé, so the setting
   * is not consulted. That is the whole point of the route and not an oversight.
   */
  fastify.post('/:listingId/details', async (request, reply) => {
    const { listingId } = request.params || {};
    const userId = request.session?.currentUser;
    if (!listingId || !userId) {
      return reply.code(400).send({ message: 'listingId or user not provided' });
    }

    // It reaches out to a third-party portal from this installation's address, which is not
    // something a shared demo should let anyone do.
    const settings = await getSettings();
    if (settings.demoMode && !isAdminFn(request)) {
      return reply.code(403).send({ error: 'Sorry, but you cannot fetch listing details in demo mode ;)' });
    }

    if (!listingStorage.userCanAccessListing(listingId, userId, isAdminFn(request))) {
      return reply.code(403).send({ message: NO_ACCESS_MESSAGE });
    }

    try {
      const listing = listingStorage.getListingById(listingId, userId, isAdminFn(request));
      if (!listing) {
        return reply.code(404).send({ message: 'Listing not found' });
      }

      const { status, fields } = await refetchListingDetailsOnce(listing);
      if (status === 'updated') {
        listingStorage.updateListingDetails(listingId, fields);
      }

      // The refreshed row rides back with the answer only when there is one, the same way the
      // geocode route does it, so the card can paint the new text without a second round trip.
      return reply.send({
        status,
        ...(status === 'updated'
          ? { listing: listingStorage.getListingById(listingId, userId, isAdminFn(request)) }
          : {}),
      });
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Failed to fetch the details of this listing' });
    }
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

  fastify.post('/:listingId/scam', async (request, reply) => {
    const { listingId } = request.params || {};
    const { override } = request.body || {};
    const userId = request.session?.currentUser;
    if (!listingId || !userId) {
      return reply.code(400).send({ message: 'listingId or user not provided' });
    }
    // `null` is a third answer, not a missing one: it hands the listing back to the detector, which
    // is how somebody undoes a verdict they no longer stand behind.
    const allowed = Object.values(SCAM_OVERRIDES);
    const normalized = override == null ? null : String(override).toLowerCase();
    if (normalized != null && !allowed.includes(normalized)) {
      return reply.code(400).send({ message: `Invalid scam override: ${override}` });
    }
    if (!listingStorage.userCanAccessListing(listingId, userId, isAdminFn(request))) {
      return reply.code(403).send({ message: NO_ACCESS_MESSAGE });
    }
    try {
      const changes = listingStorage.setListingScamOverride(listingId, normalized);
      if (changes === 0) {
        return reply.code(404).send({ message: 'Listing not found' });
      }
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Failed to update the scam verdict of this listing' });
    }

    // After the write is known to have landed, so a request that changed nothing is not counted as
    // usage. Only the two verdicts are counted at all: clearing one is somebody undoing a click, and
    // counting that as a third kind of usage would inflate the very number it is meant to measure.
    if (normalized != null) {
      await trackPoi(normalized === SCAM_OVERRIDES.SCAM ? TRACKING_POIS.SCAM_MARKED : TRACKING_POIS.SCAM_DISMISSED);
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

  /**
   * Delete every listing the given filter matches, however many pages that spans.
   *
   * The overview's per-row delete sends ids, which stops being workable at the scale this exists
   * for: a few hundred wrong listings from one misconfigured job. The filter travels instead of the
   * ids, so the set is decided in one statement rather than paged out of the database and back in,
   * and nothing the scheduler stores mid-request slips through the gap.
   *
   * There is no id list to authorise here. The user scoping lives inside the shared WHERE that
   * {@link listingStorage.deleteListingsByFilter} builds, so a filter can only ever name rows the
   * caller may already see - the same clause that decides what `/table` shows them.
   */
  fastify.delete('/filtered', async (request, reply) => {
    const { hardDelete = false, ...filterSource } = request.body || {};
    const settings = await getSettings();
    try {
      if (settings.demoMode && !isAdminFn(request)) {
        return reply.code(403).send({ error: 'Sorry, but you cannot remove listings in demo mode ;)' });
      }
      const { filters } = normalizeListingFilters(filterSource, {
        userId: request.session.currentUser,
        isAdmin: isAdminFn(request),
      });
      const { changes } = listingStorage.deleteListingsByFilter(filters, hardDelete === true);
      return reply.send({ deleted: changes });
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

  /**
   * Mark listings as available again after the alive-checker got them wrong.
   *
   * Takes the user at their word rather than probing: they are looking at the open ad, which is
   * more than the probe ever knew. See {@link listingStorage.reactivateListings} for what that
   * costs - the row is excluded from every future active check.
   *
   * Same shape and guards as `/restore` above, which solves the neighbouring problem of a listing
   * the user hid by hand.
   */
  fastify.post('/reactivate', async (request, reply) => {
    const { ids } = request.body || {};
    const settings = await getSettings();
    try {
      if (settings.demoMode && !isAdminFn(request)) {
        return reply.code(403).send({ error: 'Sorry, but you cannot reactivate listings in demo mode ;)' });
      }
      if (Array.isArray(ids) && ids.length > 0) {
        const allowed = listingStorage.filterListingIdsForUser(ids, request.session.currentUser, isAdminFn(request));
        if (allowed.length !== new Set(ids).size) {
          return reply.code(403).send({ error: NO_ACCESS_MESSAGE });
        }
        listingStorage.reactivateListings(allowed);
      }
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ error: error.message });
    }
    return reply.send();
  });
}
