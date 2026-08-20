/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { NoNewListingsWarning } from './errors.js';
import {
  attachTravelTimes,
  deleteListingsById,
  getKnownListingHashesForJobAndProvider,
  storeListings,
  updateListingDistances,
} from './services/storage/listingsStorage.js';
import { getJob } from './services/storage/jobStorage.js';
import { sendToUser } from './services/sse/sse-broker.js';
import * as notify from './notification/notify.js';
import Extractor from './services/extractor/extractor.js';
import urlModifier from './services/queryStringMutator.js';
import logger from './services/logger.js';
import { geocodeAddress } from './services/geocoding/geoCodingService.js';
import { distancesToAddresses } from './services/listings/distanceCalculator.js';
import { updateTravelTimesForListings } from './services/listings/travelTimeSweeper.js';
import { getSettings, getUserSettings, getAddresses } from './services/storage/settingsStorage.js';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { formatListing } from './utils/formatListing.js';
import { addressesWithBudget, exceedsCommuteBudget, normalizeCommuteFilter } from './utils/commuteBudget.js';

/** @import { ParsedListing } from './types/listing.js' */
/** @import { Job } from './types/job.js' */
/** @import { ProviderConfig } from './types/providerConfig.js' */
/** @import { SpecFilter, SpatialFilter } from './types/filter.js' */
/** @import { SimilarityCache } from './types/similarityCache.js' */
/** @import { Browser } from './types/browser.js' */

/**
 * Runtime orchestrator for fetching, normalizing, filtering, deduplicating, storing,
 * and notifying about new listings from a configured provider.
 *
 * The execution flow is:
 * 1) Prepare provider URL (sorting, etc.)
 * 2) Extract raw listings from the provider
 * 3) Normalize listings to the provider schema
 * 4) Filter out incomplete/blacklisted listings
 * 5) Identify new listings (vs. previously stored hashes)
 * 6) Filter out entries that do not match the job's specFilter
 * 7) Optionally enrich new listings via provider.fetchDetails
 * 8) Optionally re-apply the provider blacklist using the (now enriched)
 *    description - only when the user opted in via
 *    `blacklist_filter_on_provider_details`
 * 9) Geocode
 * 10) Persist new listings
 * 11) Calculate distances to the user's addresses
 * 12) Filter out entries similar to already seen ones
 * 13) Filter out entries that do not match the job's spatialFilter
 * 14) Look up travel times to the user's addresses
 * 15) Apply the job's commute filter to the entries that are too far away
 * 16) Dispatch notifications
 *
 * The ordering is deliberate in two places. The spec filter sits as early as it can - it needs
 * nothing but the normalized price, size and rooms - so an excluded listing never pays for a
 * detail fetch, a geocode or an insert. The similarity and area filters, by contrast, run after
 * the insert and soft-delete what they reject: the stored row is what makes step 5 skip the
 * listing next time, and without it an out-of-area listing would be geocoded again on every run.
 */
class FredyPipelineExecutioner {
  /**
   * Create a new runtime instance for a single provider/job execution.
   *
   * @param {ProviderConfig} providerConfig Provider configuration.
   * @param {Job} job Job configuration.
   * @param {string} providerId The ID of the provider currently in use.
   * @param {SimilarityCache} similarityCache Cache instance for checking similar entries.
   * @param {Browser} browser Puppeteer browser instance.
   * @param {{maxDetailFetches?: number|null}} [options] Run options. `maxDetailFetches` caps how
   *   many listings are enriched via the provider's detail page; the test suite sets it to 1 so a
   *   fixture run does not walk every listing. Null means no cap, which is what production wants.
   */
  constructor(providerConfig, job, providerId, similarityCache, browser, options = {}) {
    /** @type {ProviderConfig} */
    this._providerConfig = providerConfig;
    /** @type {Object} */
    this._jobNotificationConfig = job.notificationAdapter;
    /** @type {string} */
    this._jobKey = job.id;
    /** @type {SpecFilter | null} */
    this._jobSpecFilter = job.specFilter;
    /** @type {SpatialFilter | null} */
    this._jobSpatialFilter = job.spatialFilter;
    /** @type {import('./utils/commuteBudget.js').CommuteFilter | null} */
    this._jobCommuteFilter = job.commuteFilter;
    /** @type {string} */
    this._providerId = providerId;
    /** @type {SimilarityCache} */
    this._similarityCache = similarityCache;
    /** @type {Browser} */
    this._browser = browser;
    /** @type {number|null} */
    this._maxDetailFetches = options?.maxDetailFetches ?? null;
  }

  /**
   * Execute the end-to-end pipeline for a single provider run.
   *
   * @returns {Promise<ParsedListing[]|void>} Resolves to the list of new (and similarity-filtered) listings
   * after notifications have been sent; resolves to void when there are no new listings.
   */
  execute() {
    return (
      Promise.resolve(urlModifier(this._providerConfig.url, this._providerConfig.sortByDateParam))
        .then((url) =>
          this._providerConfig.getListings
            ? this._providerConfig.getListings.call(this, url, this._browser)
            : this._getListings(url),
        )
        .then(this._normalize.bind(this))
        .then(this._filter.bind(this))
        .then(this._findNew.bind(this))
        // The spec filter runs here, before anything expensive. It only reads price, size and rooms,
        // which normalize() has already produced, so a listing the user excluded by price never
        // costs a detail page fetch, a Nominatim lookup or a database round trip. It used to run
        // last, after all three.
        .then(this._filterBySpecs.bind(this))
        .then(this._fetchDetails.bind(this))
        .then(this._filterAfterDetails.bind(this))
        .then(this._geocode.bind(this))
        .then(this._save.bind(this))
        .then(this._calculateDistance.bind(this))
        // These two still store first and soft-delete after. The stored row is what makes _findNew
        // skip the listing on the next run: without it the listing counts as new again every cycle
        // and pays for another geocode, which is precisely what the area filter needs and cannot
        // avoid. The row is the tombstone, not an oversight.
        .then(this._filterBySimilarListings.bind(this))
        .then(this._filterByArea.bind(this))
        .then(this._sendNewListingsToUser.bind(this))
        // Last thing before the notification goes out, and only for the listings that survived every
        // filter, so no routing request is ever spent on a listing the user will never see.
        .then(this._calculateTravelTimes.bind(this))
        // Reads the numbers the step above just produced. The only filter whose severity the user
        // chooses: it can colour a listing, hold back its notification, or drop it like the area
        // filter does.
        .then(this._filterByCommuteBudget.bind(this))
        .then(this._notify.bind(this))
        .catch(this._handleError.bind(this))
    );
  }

  /**
   * Optionally, enrich new listings with data from their detail pages.
   * Only called when the provider config defines a `fetchDetails` function.
   * Fetches are performed sequentially to avoid overloading the provider or
   * the shared browser instance.
   *
   * @param {Listing[]} newListings New listings to enrich.
   * @returns {Promise<Listing[]>} Resolves with enriched listings.
   */
  async _fetchDetails(newListings) {
    if (typeof this._providerConfig.fetchDetails !== 'function') {
      return newListings;
    }
    const userId = getJob(this._jobKey)?.userId;
    const enabledProviders = getUserSettings(userId)?.provider_details ?? [];
    if (!userId || !Array.isArray(enabledProviders) || !enabledProviders.includes(this._providerId)) {
      return newListings;
    }
    // The cap comes from the constructor rather than from `process.env.NODE_ENV === 'test'`, which
    // is test-shape logic that used to ship in the production pipeline.
    const listingsToEnrich =
      this._maxDetailFetches == null ? newListings : newListings.slice(0, this._maxDetailFetches);
    const enriched = [];
    for (const listing of listingsToEnrich) {
      enriched.push(await this._providerConfig.fetchDetails(listing, this._browser));
    }
    return enriched;
  }

  /**
   * Geocode new listings.
   *
   * @param {ParsedListing[]} newListings New listings to geocode.
   * @returns {Promise<ParsedListing[]>} Resolves with the listings (potentially with added coordinates).
   */
  async _geocode(newListings) {
    for (const listing of newListings) {
      if (listing.address) {
        const coords = await geocodeAddress(listing.address);
        if (coords && coords.lat !== -1 && coords.lng !== -1) {
          listing.latitude = coords.lat;
          listing.longitude = coords.lng;
        }
      }
    }
    return newListings;
  }

  /**
   * Filter listings by area using the provider's area filter if available.
   * Only filters if areaFilter is set on the provider AND the listing has coordinates.
   *
   * @param {ParsedListing[]} newListings New listings to filter by area.
   * @returns {ParsedListing[]} Resolves with listings that are within the area (or not filtered if no area is set).
   */
  _filterByArea(newListings) {
    const polygonFeatures = this._jobSpatialFilter?.features?.filter((f) => f.geometry?.type === 'Polygon');

    // If no area filter is set, return all listings
    if (!polygonFeatures?.length) {
      return newListings;
    }

    const toDeleteListingByIds = [];
    // Filter listings by area - keep only those within the polygon
    const keptListings = newListings.filter((listing) => {
      // If listing doesn't have coordinates, keep it (don't filter out)
      if (listing.latitude == null || listing.longitude == null) {
        return true;
      }

      // Check if the point is inside the polygons
      const point = [listing.longitude, listing.latitude]; // GeoJSON format: [lon, lat]
      const isInPolygon = polygonFeatures.some((feature) => booleanPointInPolygon(point, feature));

      if (!isInPolygon) {
        toDeleteListingByIds.push(listing.id);
      }

      return isInPolygon;
    });

    if (toDeleteListingByIds.length > 0) {
      deleteListingsById(toDeleteListingByIds);
    }

    return keptListings;
  }

  /**
   * Filter listings based on their specifications (minRooms, minSize, maxPrice).
   *
   * Runs before the listings are stored, so it simply drops them - there is no row to delete yet.
   * That is the point of its position in the pipeline: everything it rejects is rejected before a
   * detail page is fetched, an address is geocoded or a row is written.
   *
   * A rejected listing leaves no trace, so it is re-evaluated on the next run. That costs nothing
   * measurable: the search page was fetched anyway and the check is three comparisons in memory.
   *
   * @param {ParsedListing[]} newListings New listings to filter.
   * @returns {ParsedListing[]} Listings that pass the specification filters.
   * @throws {NoNewListingsWarning} When every listing is filtered out.
   */
  _filterBySpecs(newListings) {
    const { minRooms, minSize, maxPrice } = this._jobSpecFilter || {};

    // If no specs are set, return all listings
    if (!minRooms && !minSize && !maxPrice) {
      return newListings;
    }

    const keptListings = newListings.filter((listing) => {
      const filterOut =
        (minRooms && listing.rooms != null && listing.rooms < minRooms) ||
        (minSize && listing.size != null && listing.size < minSize) ||
        (maxPrice && listing.price != null && listing.price > maxPrice);
      return !filterOut;
    });

    const removed = newListings.length - keptListings.length;
    if (removed > 0) {
      logger.debug(`Spec filter removed ${removed} listing(s) (Provider: '${this._providerId}')`);
    }
    // Short-circuit the rest of the pipeline rather than letting an empty array walk through the
    // detail fetch and the geocode.
    if (keptListings.length === 0) {
      throw new NoNewListingsWarning();
    }

    return keptListings;
  }

  /**
   * Fetch listings from the provider, using the default Extractor flow unless
   * a provider-specific getListings override is supplied.
   *
   * @param {string} url The provider URL to fetch from.
   * @returns {Promise<ParsedListing[]>} Resolves with an array of listings (empty when none found).
   */
  async _getListings(url) {
    const extractor = new Extractor({ ...this._providerConfig.puppeteerOptions, browser: this._browser });
    await extractor.execute(url, this._providerConfig.waitForSelector, this._providerId);
    const listings = extractor.parseResponseText(
      this._providerConfig.crawlContainer,
      this._providerConfig.crawlFields,
      url,
    );
    return listings == null ? [] : listings;
  }

  /**
   * Normalize raw listings into the provider-specific ParsedListing shape.
   *
   * @param {any[]} listings Raw listing entries from the extractor or override.
   * @returns {ParsedListing[]} Normalized listings.
   */
  _normalize(listings) {
    return listings.map((listing) => this._providerConfig.normalize(listing));
  }

  /**
   * Filter out listings that are missing required fields and those rejected by the
   * provider's blacklist/filter function.
   *
   * @param {ParsedListing[]} listings Listings to filter.
   * @returns {ParsedListing[]} Filtered listings that pass validation and provider filter.
   */
  _filter(listings) {
    const requiredKeys = this._providerConfig.requiredFieldNames;
    const requireValues = ['id', 'link', 'title'];

    return (
      listings
        // this should never filter some listings out, because the normalize function should always extract all fields.
        .filter((item) => requiredKeys.every((key) => key in item))
        // Drop listings missing a required identifying field *before* the provider
        // filter runs, so provider filter functions never have to defend against a
        // null id/link/title.
        .filter((item) => requireValues.every((key) => item[key] != null))
        // TODO: move blacklist filter to this file, so it will handle for all providers in same way.
        .filter(this._providerConfig.filter)
    );
  }

  /**
   * Re-apply the provider's blacklist filter after `_fetchDetails` has had a
   * chance to enrich the listings (e.g., load the full description from the
   * detail page). The initial `_filter` step only sees the truncated snippet
   * exposed on the search results page, so a blacklisted term that lives
   * deeper in the listing's full description would otherwise slip through.
   *
   * Opt-in: gated by the user setting `blacklist_filter_on_provider_details`.
   * The full detail description tends to contain a lot of boilerplate (legal,
   * exposé contact info, generic marketing copy) which can accidentally match
   * a blacklist term and remove otherwise relevant listings. Users who want
   * the stricter behavior must enable the setting explicitly.
   *
   * Throws {@link NoNewListingsWarning} when all listings are filtered out
   * so the rest of the pipeline (save + notify) is short-circuited.
   *
   * @param {ParsedListing[]} listings Enriched listings to re-filter.
   * @returns {ParsedListing[]} Listings that still pass the provider's filter.
   * @throws {NoNewListingsWarning} When every listing is filtered out.
   */
  _filterAfterDetails(listings) {
    if (typeof this._providerConfig.filter !== 'function') {
      return listings;
    }
    const userId = getJob(this._jobKey)?.userId;
    const enabled = getUserSettings(userId)?.blacklist_filter_on_provider_details === true;
    if (!enabled) {
      return listings;
    }
    const kept = listings.filter(this._providerConfig.filter);
    const removed = listings.length - kept.length;
    if (removed > 0) {
      logger.debug(
        `Re-filter after detail enrichment removed ${removed} listing(s) by blacklist (Provider: '${this._providerId}')`,
      );
    }
    if (kept.length === 0) {
      throw new NoNewListingsWarning();
    }
    return kept;
  }

  /**
   * Determine which listings are new by comparing their IDs against stored hashes.
   *
   * @param {ParsedListing[]} listings Listings to evaluate for novelty.
   * @returns {ParsedListing[]} New listings not seen before.
   * @throws {NoNewListingsWarning} When no new listings are found.
   */
  _findNew(listings) {
    logger.debug(`Checking ${listings.length} listings for new entries (Provider: '${this._providerId}')`);
    const knownHashes = new Set(getKnownListingHashesForJobAndProvider(this._jobKey, this._providerId) || []);

    const newListings = listings.filter((o) => !knownHashes.has(o.id));
    if (newListings.length === 0) {
      throw new NoNewListingsWarning();
    }
    return newListings;
  }

  /**
   * Send notifications for new listings using the configured notification adapter(s).
   *
   * @param {ParsedListing[]} newListings New listings to notify about.
   * @returns {Promise<ParsedListing[]>} Resolves to the provided listings after notifications complete.
   * @throws {NoNewListingsWarning} When there are no listings to notify about.
   */
  async _notify(newListings) {
    if (newListings.length === 0) {
      throw new NoNewListingsWarning();
    }
    // The units follow the job owner's interface language, so a user running Fredy in English no
    // longer gets "3 Zimmer" in every notification.
    const userId = getJob(this._jobKey)?.userId;
    const language = getUserSettings(userId)?.language ?? 'en';
    const formattedListings = newListings.map((listing) => formatListing(listing, language));
    const settings = await getSettings();
    const baseUrl = settings?.baseUrl ?? '';
    const sendNotifications = notify.send(
      this._providerId,
      formattedListings,
      this._jobNotificationConfig,
      this._jobKey,
      baseUrl,
    );
    return Promise.all(sendNotifications).then(() => newListings);
  }

  /**
   * Persist new listings and pass them through.
   *
   * @param {ParsedListing[]} newListings Listings to store.
   * @returns {ParsedListing[]} The same listings, unchanged.
   */
  _save(newListings) {
    logger.debug(`Storing ${newListings.length} new listings (Provider: '${this._providerId}')`);
    storeListings(this._jobKey, this._providerId, newListings);
    return newListings;
  }

  /**
   * Broadcast real-time live reload event to user via SSE broker.
   *
   * @param {ParsedListing[]} newListings New listings to broadcast.
   * @returns {ParsedListing[]} The same listings, unchanged.
   */
  _sendNewListingsToUser(newListings) {
    if (newListings.length > 0) {
      try {
        const job = getJob(this._jobKey);
        const userId = job?.userId;
        if (userId) {
          sendToUser(userId, 'listings:new', { jobId: this._jobKey, count: newListings.length });
        }
      } catch (err) {
        logger.error('Error broadcasting listings:new event', err);
      }
    }
    return newListings;
  }

  /**
   * Calculate distance for new listings.
   *
   * @param {ParsedListing[]} listings
   * @returns {ParsedListing[]}
   * @private
   */
  _calculateDistance(listings) {
    if (listings.length === 0) return [];

    const job = getJob(this._jobKey);
    const userId = job?.userId;

    if (userId == null || typeof userId !== 'string') {
      logger.debug('Skipping distance calculation: userId is missing or invalid');
      return listings;
    }

    const addresses = getAddresses(getUserSettings(userId));
    if (addresses.length === 0) {
      return listings;
    }

    for (const listing of listings) {
      if (listing.latitude != null && listing.longitude != null) {
        const distances = distancesToAddresses(listing.latitude, listing.longitude, addresses);
        updateListingDistances(listing.id, distances);
        listing.distances = distances;
      }
    }
    return listings;
  }

  /**
   * Look up how long it takes to reach the new listings by public transport.
   *
   * Costs at most one request per configured address, and usually none: it works from the same
   * region-wide reachability answer the periodic sweep fetched, which is cached for hours. The
   * number of new listings does not enter into it.
   *
   * Runs here rather than in the sweep alone so a notification can already carry the commute. It is
   * allowed to achieve nothing: a failure, a rate limit or a slow answer must never cost the user
   * the notification itself, which is the whole point of the run.
   *
   * @param {ParsedListing[]} listings
   * @returns {Promise<ParsedListing[]>}
   * @private
   */
  async _calculateTravelTimes(listings) {
    if (listings.length === 0) return listings;

    const userId = getJob(this._jobKey)?.userId;
    if (userId == null || typeof userId !== 'string') {
      return listings;
    }

    const addresses = getAddresses(getUserSettings(userId));
    if (addresses.length === 0) {
      return listings;
    }

    try {
      await updateTravelTimesForListings(listings, addresses);
      attachTravelTimes(listings);
    } catch (err) {
      logger.warn('Could not calculate travel times for the new listings', err);
    }
    return listings;
  }

  /**
   * Deal with the listings that are further away than this job said it would travel.
   *
   * The limit is the job's, because it is a search criterion: two searches can reasonably disagree
   * about the same office, twenty minutes for a flat in the city and fifty for a house outside it.
   * The addresses are the job owner's, which is the same choice the travel times themselves make.
   *
   * What happens to a listing over the limit is also the job's to say:
   *
   * - `mark` does nothing here at all. The listing is notified about like any other; only the map
   *   and the cards colour it, which is the whole point of offering an action that cannot cost
   *   anybody anything.
   * - `notify` keeps the listing and skips the push. The row stays in the list, on the map and
   *   inside the "reachable within" filter. It is a claim about what is worth interrupting somebody
   *   for, which is much smaller than a claim about what is worth keeping.
   * - `exclude` also soft-deletes it, the way the area filter above already does. The tombstone is
   *   what stops the listing being found again on the next run.
   *
   * This only ever runs on a listing's first pass, so it judges on whatever was known then. A
   * listing whose travel time arrives later is never reconsidered, which is another reason nothing
   * is held back on a missing answer.
   *
   * With every listing held back, `_notify` raises {@link NoNewListingsWarning} on its own, which is
   * the same quiet end the run already has when a provider returns nothing new.
   *
   * @param {ParsedListing[]} listings
   * @returns {ParsedListing[]} The listings worth notifying about.
   * @private
   */
  _filterByCommuteBudget(listings) {
    if (listings.length === 0) return listings;

    const filter = normalizeCommuteFilter(this._jobCommuteFilter);
    if (filter == null) {
      return listings;
    }
    // Colouring only. Reading the settings below would cost a lookup to reach the same answer.
    if (filter.action === 'mark') {
      return listings;
    }

    const userId = getJob(this._jobKey)?.userId;
    if (userId == null || typeof userId !== 'string') {
      return listings;
    }

    const addresses = addressesWithBudget(getAddresses(getUserSettings(userId)), filter);
    if (addresses.length === 0) {
      return listings;
    }

    const overBudget = listings.filter((listing) => exceedsCommuteBudget(listing.travelTimes, addresses));
    if (overBudget.length === 0) {
      return listings;
    }

    logger.debug(
      `${overBudget.length} listing(s) over the commute budget, action '${filter.action}' (Provider: '${this._providerId}')`,
    );
    if (filter.action === 'exclude') {
      deleteListingsById(overBudget.map((listing) => listing.id));
    }

    const excluded = new Set(overBudget.map((listing) => listing.id));
    return listings.filter((listing) => !excluded.has(listing.id));
  }

  /**
   * Remove listings that are similar to already known entries according to the similarity cache.
   * Adds the remaining listings to the cache.
   *
   * The provider id is part of what is handed over, not decoration: the cache only ever treats two
   * listings as the same flat when they came from *different* providers, which is what keeps two
   * genuinely separate units in one building - listed side by side on one portal, often identical
   * on paper - from collapsing into a single notification.
   *
   * @param {ParsedListing[]} listings Listings to filter by similarity.
   * @returns {ParsedListing[]} Listings considered unique enough to keep.
   */
  _filterBySimilarListings(listings) {
    const filteredIds = [];
    const keptListings = listings.filter((listing) => {
      const similar = this._similarityCache.checkAndAddEntry({
        jobId: this._jobKey,
        provider: this._providerId,
        title: listing.title,
        address: listing.address,
        price: listing.price,
        size: listing.size,
        rooms: listing.rooms,
        description: listing.description,
      });
      if (similar) {
        logger.debug(
          `Filtering similar entry for title '${listing.title}' and address '${listing.address}' (Provider: '${this._providerId}')`,
        );
        filteredIds.push(listing.id);
      }
      return !similar;
    });

    if (filteredIds.length > 0) {
      deleteListingsById(filteredIds);
    }

    return keptListings;
  }

  /**
   * Handle errors occurring in the pipeline, logging levels depending on type.
   *
   * @param {Error} err Error instance thrown by previous steps.
   * @returns {void}
   */
  _handleError(err) {
    if (err.name === 'NoNewListingsWarning') {
      logger.debug(`No new listings found (Provider: '${this._providerId}').`);
    } else {
      logger.error(err);
    }
  }
}

export default FredyPipelineExecutioner;
