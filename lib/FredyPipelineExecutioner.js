/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { NoNewListingsWarning } from './errors.js';
import {
  storeListings,
  getKnownListingHashesForJobAndProvider,
  deleteListingsById,
} from './services/storage/listingsStorage.js';
import { getJob } from './services/storage/jobStorage.js';
import * as notify from './notification/notify.js';
import Extractor from './services/extractor/extractor.js';
import urlModifier from './services/queryStringMutator.js';
import logger from './services/logger.js';
import { geocodeAddress } from './services/geocoding/geoCodingService.js';
import { distanceMeters } from './services/listings/distanceCalculator.js';
import { getUserSettings } from './services/storage/settingsStorage.js';
import { updateListingDistance } from './services/storage/listingsStorage.js';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { formatListing } from './utils/formatListing.js';

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
 * 6) Persist new listings
 * 7) Filter out entries similar to already seen ones
 * 8) Filter out entries that do not match the job's specFilter
 * 9) Filter out entries that do not match the job's spatialFilter
 * 10) Dispatch notifications
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
   */
  constructor(providerConfig, job, providerId, similarityCache, browser) {
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
    /** @type {string} */
    this._providerId = providerId;
    /** @type {SimilarityCache} */
    this._similarityCache = similarityCache;
    /** @type {Browser} */
    this._browser = browser;
  }

  /**
   * Execute the end-to-end pipeline for a single provider run.
   *
   * @returns {Promise<ParsedListing[]|void>} Resolves to the list of new (and similarity-filtered) listings
   * after notifications have been sent; resolves to void when there are no new listings.
   */
  execute() {
    return Promise.resolve(urlModifier(this._providerConfig.url, this._providerConfig.sortByDateParam))
      .then(this._providerConfig.getListings?.bind(this) ?? this._getListings.bind(this))
      .then(this._normalize.bind(this))
      .then(this._filter.bind(this))
      .then(this._findNew.bind(this))
      .then(this._fetchDetails.bind(this))
      .then(this._geocode.bind(this))
      .then(this._save.bind(this))
      .then(this._calculateDistance.bind(this))
      .then(this._filterBySimilarListings.bind(this))
      .then(this._filterBySpecs.bind(this))
      .then(this._filterByArea.bind(this))
      .then(this._notify.bind(this))
      .catch(this._handleError.bind(this));
  }

  /**
   * Optionally enrich new listings with data from their detail pages.
   * Only called when the provider config defines a `fetchDetails` function.
   * Runs all fetches in parallel. Each individual fetch must handle its own errors
   * and always resolve (never reject) to avoid aborting other listings.
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
    const listingsToEnrich = process.env.NODE_ENV === 'test' ? newListings.slice(0, 1) : newListings;
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
        if (coords) {
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
   * Filter listings based on its specifications (minRooms, minSize, maxPrice).
   *
   * @param {ParsedListing[]} newListings New listings to filter.
   * @returns {ParsedListing[]} Resolves with listings that pass the specification filters.
   */
  _filterBySpecs(newListings) {
    const { minRooms, minSize, maxPrice } = this._jobSpecFilter || {};

    // If no specs are set, return all listings
    if (!minRooms && !minSize && !maxPrice) {
      return newListings;
    }

    const toDeleteListingByIds = [];
    const keptListings = newListings.filter((listing) => {
      const filterOut =
        (minRooms && listing.rooms && listing.rooms < minRooms) ||
        (minSize && listing.size && listing.size < minSize) ||
        (maxPrice && listing.price && listing.price > maxPrice);

      if (filterOut) {
        toDeleteListingByIds.push(listing.id);
      }
      return !filterOut;
    });

    if (toDeleteListingByIds.length > 0) {
      deleteListingsById(toDeleteListingByIds);
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
  _getListings(url) {
    const extractor = new Extractor({ ...this._providerConfig.puppeteerOptions, browser: this._browser });
    return new Promise((resolve, reject) => {
      extractor
        .execute(url, this._providerConfig.waitForSelector)
        .then(() => {
          const listings = extractor.parseResponseText(
            this._providerConfig.crawlContainer,
            this._providerConfig.crawlFields,
            url,
          );
          resolve(listings == null ? [] : listings);
        })
        .catch((err) => {
          reject(err);
          logger.error(err);
        });
    });
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
    const requiredKeys = this._providerConfig.fieldNames;
    const requireValues = ['id', 'link', 'title'];

    const filteredListings = listings
      // this should never filter some listings out, because the normalize function should always extract all fields.
      .filter((item) => requiredKeys.every((key) => key in item))
      // TODO: move blacklist filter to this file, so it will handle for all providers in same way.
      .filter(this._providerConfig.filter)
      // filter out listings that are missing required fields
      .filter((item) => requireValues.every((key) => item[key] != null));

    return filteredListings;
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
    const hashes = getKnownListingHashesForJobAndProvider(this._jobKey, this._providerId) || [];

    const newListings = listings.filter((o) => !hashes.includes(o.id));
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
  _notify(newListings) {
    if (newListings.length === 0) {
      throw new NoNewListingsWarning();
    }
    // TODO: move this to the notification adapter, so it will handle for all providers in same way.
    const formattedListings = newListings.map(formatListing);
    const sendNotifications = notify.send(
      this._providerId,
      formattedListings,
      this._jobNotificationConfig,
      this._jobKey,
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

    const userSettings = getUserSettings(userId);
    const homeAddress = userSettings?.home_address;

    if (!homeAddress || !homeAddress.coords) {
      return listings;
    }

    const { lat, lng } = homeAddress.coords;
    for (const listing of listings) {
      if (listing.latitude != null && listing.longitude != null) {
        const dist = distanceMeters(lat, lng, listing.latitude, listing.longitude);
        updateListingDistance(listing.id, dist);
        listing.distance_to_destination = dist;
      }
    }
    return listings;
  }

  /**
   * Remove listings that are similar to already known entries according to the similarity cache.
   * Adds the remaining listings to the cache.
   *
   * @param {ParsedListing[]} listings Listings to filter by similarity.
   * @returns {ParsedListing[]} Listings considered unique enough to keep.
   */
  _filterBySimilarListings(listings) {
    const filteredIds = [];
    const keptListings = listings.filter((listing) => {
      const similar = this._similarityCache.checkAndAddEntry({
        title: listing.title,
        address: listing.address,
        price: listing.price,
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
