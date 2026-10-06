/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as listingStorage from '../../services/storage/listingsStorage.js';
import * as watchListStorage from '../../services/storage/watchListStorage.js';
import { isAdmin as isAdminFn } from '../security.js';
import logger from '../../services/logger.js';
import { nullOrEmpty } from '../../utils.js';
import { getProviders } from '../../utils.js';
import { getJob } from '../../services/storage/jobStorage.js';
import { getSettings, getUserSettings } from '../../services/storage/settingsStorage.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import { affordabilityBandFor } from '../../services/finance/listingFilter.js';
import { thresholdsFor, verdictForListing } from '../../services/finance/affordability.js';
import { canAccessJob } from '../../services/security/access.js';
import { updateDistancesForListing } from '../../services/geocoding/distanceService.js';
import { geocodeAddress, isGeocodingPaused } from '../../services/geocoding/geoCodingService.js';
import { getCountriesForProvider } from '../../services/providers/providerCountries.js';
import { filterMask, TECHNOLOGIES, OPERATOR_CODES } from '../../services/connectivity/mobileBits.js';
import { downloadListingImages, readListingImage } from '../../services/listings/listingImages.js';
import {
  withEnrichmentBrowser,
  isProviderCoolingDown,
  coolDownProvider,
} from '../../services/listings/enrichmentBrowser.js';
import { isSessionRefused, releaseSession } from '../../services/immowelt/immoweltBff.js';

/**
 * Deliberately identical for "listing does not exist" and "listing belongs to someone else", so the
 * response cannot be used to probe which ids are real.
 */
const NO_ACCESS_MESSAGE = 'You are trying to access a listing that is not associated to your user';

/**
 * One enrichment per listing at a time. A double-click (or two tabs) must not launch two
 * browsers against the same exposé; the second caller awaits the first one's answer.
 *
 * @type {Map<string, Promise<{status: string}>>}
 */
const detailEnrichmentInFlight = new Map();

/**
 * Fetch a listing's exposé once and persist description, facts and gallery.
 *
 * Runs outside the request handler's try/catch on purpose: failures answer `unavailable`
 * rather than throwing, so a retry stays possible and the sparse listing is kept.
 *
 * Browser providers share one persistent enrichment browser (see `enrichmentBrowser.js`):
 * minting a zero-history browser per click is DataDome's textbook bot shape, while a warmed
 * session with surviving cookies is what the pipeline's own detail fetches succeed on. A
 * provider refused mid-session cools down instead of burning another warmup on a known
 * verdict - and a spawn that stalls answers `unavailable` after its timeout rather than
 * wedging the request, the spinner and every retry behind it.
 *
 * @param {string} listingId DB id of the listing.
 * @returns {Promise<{status: ('ready'|'unavailable'|'unsupported')}>>}
 */
async function enrichListingDetails(listingId) {
  const existing = detailEnrichmentInFlight.get(listingId);
  if (existing) {
    return existing;
  }
  const task = (async () => {
    const listing = listingStorage.getListingById(listingId, null, true);
    if (!listing) {
      return { status: 'unavailable' };
    }
    const providers = await getProviders();
    const providerModule = providers.find((loaded) => loaded.metaInformation?.id === listing.provider);
    const fetchDetails = providerModule?.config?.fetchDetails ?? providerModule?.fetchDetails;
    if (!providerModule || typeof fetchDetails !== 'function') {
      listingStorage.setListingDetails(listingId, {});
      return { status: 'unsupported' };
    }

    const job = listing.job_id ? getJob(listing.job_id) : null;
    const jobProviderEntry = job?.provider?.find?.((entry) => entry?.id === listing.provider) ?? null;
    let providerConfig;
    try {
      providerConfig = providerModule.createConfig(
        { ...(jobProviderEntry ?? { url: listing.link }), userId: job?.userId },
        job?.blacklist ?? [],
      );
    } catch (error) {
      logger.warn(
        `Could not build provider config for detail enrichment of listing '${listingId}'.`,
        error?.message || error,
      );
      return { status: 'unavailable' };
    }
    const runFetchDetails = providerConfig.fetchDetails ?? fetchDetails;
    if (typeof runFetchDetails !== 'function') {
      listingStorage.setListingDetails(listingId, {});
      return { status: 'unsupported' };
    }

    const sparse = {
      id: listing.hash ?? listing.id,
      link: listing.link,
      title: listing.title,
      price: listing.price,
      size: listing.size,
      rooms: listing.rooms,
      address: listing.address,
      description: listing.description,
      image: listing.image_url,
      buildYear: listing.build_year ?? null,
      energyClass: listing.energy_class ?? null,
      images: [],
    };

    let browser = null;
    try {
      let enriched = sparse;
      if (runFetchDetails.length > 1) {
        if (isProviderCoolingDown(listing.provider)) {
          logger.debug(
            `Skipping detail enrichment for '${listingId}': provider '${listing.provider}' is cooling down.`,
          );
          return { status: 'unavailable' };
        }
        enriched =
          (await withEnrichmentBrowser(async (sharedBrowser) => {
            browser = sharedBrowser;
            return runFetchDetails({ ...sparse }, sharedBrowser);
          }, listing.link)) ?? sparse;
        // A refused session poisons the shared browser for every later click, so it is dropped
        // here (the page, not the browser - the cookies stay) and the provider cools down.
        if (listing.provider === 'immowelt' && browser && isSessionRefused(browser)) {
          await releaseSession(browser);
          coolDownProvider(listing.provider);
          logger.debug(`Provider 'immowelt' refused the enrichment session; cooling down.`);
        }
      } else {
        enriched = (await runFetchDetails({ ...sparse })) ?? sparse;
      }
      const descriptionChanged =
        typeof enriched.description === 'string' &&
        enriched.description.length > 0 &&
        enriched.description !== sparse.description;
      const galleryUrls = Array.isArray(enriched.images)
        ? enriched.images.filter((url) => typeof url === 'string' && url.length > 0)
        : [];
      if (!descriptionChanged && galleryUrls.length === 0) {
        return { status: 'unavailable' };
      }
      let imageFiles = null;
      if (galleryUrls.length > 0) {
        const stored = await downloadListingImages(listingId, galleryUrls);
        imageFiles = stored.length > 0 ? stored : null;
      }
      listingStorage.setListingDetails(listingId, {
        description: descriptionChanged ? enriched.description : null,
        size: enriched.size ?? null,
        rooms: enriched.rooms ?? null,
        buildYear: enriched.buildYear ?? null,
        energyClass: enriched.energyClass ?? null,
        imageFiles,
      });
      return { status: 'ready' };
    } catch (error) {
      logger.warn(`Could not enrich listing '${listingId}' with provider details.`, error?.message || error);
      // A stalled spawn rejects here and the shared-browser promise resets itself, so the next
      // click tries again instead of awaiting the same stuck launch. Nothing to close: the
      // browser outlives the call on purpose, and a spawn that never resolved has no handle.
      return { status: 'unavailable' };
    }
  })();
  detailEnrichmentInFlight.set(listingId, task);
  try {
    return await task;
  } finally {
    detailEnrichmentInFlight.delete(listingId);
  }
}

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
      travelTimeMode,
      travelTimeMaxMinutes,
      travelTimeLabel,
      connectivityMinDown,
      connectivityFiber,
      connectivityMobileTech,
      connectivityMobileOperator,
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
    // The mode and the ceiling come from the request, but only ever as a name and a number: the
    // whitelist that turns a mode into a column lives in the query itself, so nothing from here
    // reaches the SQL.
    const parsedMaxMinutes = Number.parseInt(String(travelTimeMaxMinutes), 10);
    const travelTimeFilter =
      ['transit', 'car', 'bike', 'walk'].includes(String(travelTimeMode).toLowerCase()) &&
      Number.isFinite(parsedMaxMinutes) &&
      parsedMaxMinutes > 0
        ? {
            mode: String(travelTimeMode).toLowerCase(),
            maxMinutes: parsedMaxMinutes,
            label: nullOrEmpty(travelTimeLabel) ? null : String(travelTimeLabel),
          }
        : null;

    // The connectivity filters. The downstream is a plain number and the fibre flag a boolean, but
    // the mobile pair is turned into a bitmask here rather than being passed through: which bit a
    // technology and operator map to is a decision for the code that wrote them, and a mask taken
    // from the query string would let a bookmarked URL ask about bits that mean something else.
    const parsedMinDown = Number.parseInt(String(connectivityMinDown), 10);
    const normalizedMinDown = Number.isFinite(parsedMinDown) && parsedMinDown > 0 ? parsedMinDown : null;
    const normalizedFiber = toBool(connectivityFiber) === true;
    const wantedTech = String(connectivityMobileTech ?? '').toLowerCase();
    const wantedOperator = String(connectivityMobileOperator ?? '').toLowerCase();
    const connectivityMobileMask = TECHNOLOGIES.includes(wantedTech)
      ? filterMask(wantedTech, OPERATOR_CODES.includes(wantedOperator) ? wantedOperator : null)
      : null;

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

    const pageData = listingStorage.queryListings({
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
      travelTimeFilter,
      connectivityMinDown: normalizedMinDown,
      connectivityFiberOnly: normalizedFiber,
      connectivityMobileMask,
      userId,
      isAdmin: isAdminFn(request),
    });

    const availableProviders =
      typeof listingStorage.getAvailableProviders === 'function'
        ? listingStorage.getAvailableProviders({
            jobId: jobIdFilter,
            jobName: jobFilter,
            userId,
            isAdmin: isAdminFn(request),
            hiddenOnly: normalizedHidden,
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

      const coords = await geocodeAddress(listing.address, await getCountriesForProvider(listing.provider));
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
  /*
   * Fetch a listing's exposé on first open ("enrich on click") and persist it.
   *
   * Scrape-time stays sparse - one undetectable list call per provider - so the per-exposé
   * request only happens when a human actually opens the listing. Idempotent: a listing whose
   * `details_fetched` flag is set answers `ready` without another outbound request, and
   * concurrent callers share one run through the module-scope single-flight map.
   *
   * Answers with a status rather than an error, mirroring the geocode retry above: `ready`
   * carries the refreshed listing, `unavailable` keeps the sparse one and may be retried,
   * `unsupported` means the provider offers no detail fetch and the flag is set so the UI
   * stops offering a retry.
   */
  fastify.post('/:listingId/details', async (request, reply) => {
    const { listingId } = request.params || {};
    const userId = request.session?.currentUser;
    if (!listingId || !userId) {
      return reply.code(400).send({ message: 'listingId or user not provided' });
    }

    const settings = await getSettings();
    if (settings.demoMode && !isAdminFn(request)) {
      return reply.code(403).send({ error: 'Sorry, but you cannot enrich listings in demo mode ;)' });
    }

    if (!listingStorage.userCanAccessListing(listingId, userId, isAdminFn(request))) {
      return reply.code(403).send({ message: NO_ACCESS_MESSAGE });
    }

    try {
      const listing = listingStorage.getListingById(listingId, userId, isAdminFn(request));
      if (!listing) {
        return reply.code(404).send({ message: 'Listing not found' });
      }
      if (listing.details_fetched === 1) {
        return reply.send({ status: 'ready', listing });
      }

      const { status } = await enrichListingDetails(listingId);
      const refreshed = listingStorage.getListingById(listingId, userId, isAdminFn(request));
      if (!refreshed) {
        return reply.code(404).send({ message: 'Listing not found' });
      }
      return reply.send({ status, listing: refreshed });
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Failed to fetch listing details' });
    }
  });

  /*
   * Serve one stored gallery file. The gallery lives on disk under the images directory as
   * `<listingId>/NN.<ext>`; the path is validated against traversal and pinned to the owning
   * listing, so one listing's images cannot address another's.
   */
  fastify.get('/:listingId/images/:index', async (request, reply) => {
    const { listingId, index } = request.params || {};
    const userId = request.session?.currentUser;
    if (!listingId || index == null || !userId) {
      return reply.code(400).send({ message: 'listingId, index or user not provided' });
    }
    if (!listingStorage.userCanAccessListing(listingId, userId, isAdminFn(request))) {
      return reply.code(403).send({ message: NO_ACCESS_MESSAGE });
    }
    const position = Number.parseInt(String(index), 10);
    if (!Number.isInteger(position) || position < 0) {
      return reply.code(400).send({ message: 'Invalid image index' });
    }
    try {
      const listing = listingStorage.getListingById(listingId, userId, isAdminFn(request));
      if (!listing) {
        return reply.code(404).send({ message: 'Listing not found' });
      }
      const files = Array.isArray(listing.image_files) ? listing.image_files : [];
      const relativePath = files[position];
      if (typeof relativePath !== 'string' || !relativePath.startsWith(`${listingId}/`)) {
        return reply.code(404).send({ message: 'Image not found' });
      }
      const file = await readListingImage(relativePath);
      if (!file) {
        return reply.code(404).send({ message: 'Image not found' });
      }
      return reply.type(file.contentType).send(file.buffer);
    } catch (error) {
      logger.error(error);
      return reply.code(500).send({ message: 'Failed to load listing image' });
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
