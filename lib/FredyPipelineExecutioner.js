/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { NoNewListingsWarning } from './errors.js';
import { storeListings, getKnownListingHashesForJobAndProvider } from './services/storage/listingsStorage.js';
import * as notify from './notification/notify.js';
import Extractor from './services/extractor/extractor.js';
import urlModifier from './services/queryStringMutator.js';
import logger from './services/logger.js';
import { geocodeAddress } from './services/geocoding/geoCodingService.js';

/**
 * @typedef {Object} Listing
 * @property {string} id Stable unique identifier (hash) of the listing.
 * @property {string} title Title or headline of the listing.
 * @property {string} [address] Optional address/location text.
 * @property {string} [price] Optional price text/value.
 * @property {string} [url] Link to the listing detail page.
 * @property {any} [meta] Provider-specific additional metadata.
 */

/**
 * @typedef {Object} SimilarityCache
 * @property {(title:string, address?:string)=>boolean} hasSimilarEntries Returns true if a similar entry is known.
 * @property {(title:string, address?:string)=>void} addCacheEntry Adds a new entry to the similarity cache.
 */

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
 * 8) Dispatch notifications
 */
class FredyPipelineExecutioner {
  /**
   * Create a new runtime instance for a single provider/job execution.
   *
   * @param {Object} providerConfig Provider configuration.
   * @param {string} providerConfig.url Base URL to crawl.
   * @param {string} [providerConfig.sortByDateParam] Query parameter used to enforce sorting by date (provider-specific).
   * @param {string} [providerConfig.waitForSelector] CSS selector to wait for before parsing content.
   * @param {Object.<string, string>} providerConfig.crawlFields Mapping of field names to selectors/paths to extract.
   * @param {string} providerConfig.crawlContainer CSS selector for the container holding listing items.
   * @param {(raw:any)=>Listing} providerConfig.normalize Function to convert raw scraped data into a Listing shape.
   * @param {(listing:Listing)=>boolean} providerConfig.filter Function to filter out unwanted listings.
   * @param {(url:string, waitForSelector?:string)=>Promise<void>|Promise<Listing[]>} [providerConfig.getListings] Optional override to fetch listings.
   *
   * @param {Object} notificationConfig Notification configuration passed to notification adapters.
   * @param {string} providerId The ID of the provider currently in use.
   * @param {string} jobKey Key of the job that is currently running (from within the config).
   * @param {SimilarityCache} similarityCache Cache instance for checking similar entries.
   */
  constructor(providerConfig, notificationConfig, providerId, jobKey, similarityCache) {
    this._providerConfig = providerConfig;
    this._notificationConfig = notificationConfig;
    this._providerId = providerId;
    this._jobKey = jobKey;
    this._similarityCache = similarityCache;
  }

  /**
   * Execute the end-to-end pipeline for a single provider run.
   *
   * @returns {Promise<Listing[]|void>} Resolves to the list of new (and similarity-filtered) listings
   * after notifications have been sent; resolves to void when there are no new listings.
   */
  execute() {
    return Promise.resolve(urlModifier(this._providerConfig.url, this._providerConfig.sortByDateParam))
      .then(this._providerConfig.getListings?.bind(this) ?? this._getListings.bind(this))
      .then(this._normalize.bind(this))
      .then(this._filter.bind(this))
      .then(this._findNew.bind(this))
      .then(this._geocode.bind(this))
      .then(this._save.bind(this))
      .then(this._filterBySimilarListings.bind(this))
      .then(this._notify.bind(this))
      .catch(this._handleError.bind(this));
  }

  /**
   * Geocode new listings.
   *
   * @param {Listing[]} newListings New listings to geocode.
   * @returns {Promise<Listing[]>} Resolves with the listings (potentially with added coordinates).
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
   * Fetch listings from the provider, using the default Extractor flow unless
   * a provider-specific getListings override is supplied.
   *
   * @param {string} url The provider URL to fetch from.
   * @returns {Promise<Listing[]>} Resolves with an array of listings (empty when none found).
   */
  _getListings(url) {
    const extractor = new Extractor();
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
   * Normalize raw listings into the provider-specific Listing shape.
   *
   * @param {any[]} listings Raw listing entries from the extractor or override.
   * @returns {Listing[]} Normalized listings.
   */
  _normalize(listings) {
    return listings.map(this._providerConfig.normalize);
  }

  /**
   * Filter out listings that are missing required fields and those rejected by the
   * provider's blacklist/filter function.
   *
   * @param {Listing[]} listings Listings to filter.
   * @returns {Listing[]} Filtered listings that pass validation and provider filter.
   */
  _filter(listings) {
    const keys = Object.keys(this._providerConfig.crawlFields);
    const filteredListings = listings.filter((item) => keys.every((key) => key in item));
    return filteredListings.filter(this._providerConfig.filter);
  }

  /**
   * Determine which listings are new by comparing their IDs against stored hashes.
   *
   * @param {Listing[]} listings Listings to evaluate for novelty.
   * @returns {Listing[]} New listings not seen before.
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
   * @param {Listing[]} newListings New listings to notify about.
   * @returns {Promise<Listing[]>} Resolves to the provided listings after notifications complete.
   * @throws {NoNewListingsWarning} When there are no listings to notify about.
   */
  _notify(newListings) {
    if (newListings.length === 0) {
      throw new NoNewListingsWarning();
    }
    const sendNotifications = notify.send(this._providerId, newListings, this._notificationConfig, this._jobKey);
    return Promise.all(sendNotifications).then(() => newListings);
  }

  /**
   * Persist new listings and pass them through.
   *
   * @param {Listing[]} newListings Listings to store.
   * @returns {Listing[]} The same listings, unchanged.
   */
  _save(newListings) {
    logger.debug(`Storing ${newListings.length} new listings (Provider: '${this._providerId}')`);
    storeListings(this._jobKey, this._providerId, newListings);
    return newListings;
  }

  /**
   * Remove listings that are similar to already known entries according to the similarity cache.
   * Adds the remaining listings to the cache.
   *
   * @param {Listing[]} listings Listings to filter by similarity.
   * @returns {Listing[]} Listings considered unique enough to keep.
   */
  _filterBySimilarListings(listings) {
    return listings.filter((listing) => {
      const similar = this._similarityCache.checkAndAddEntry({
        title: listing.title,
        address: listing.address,
        price: listing.price,
      });
      if (similar) {
        logger.debug(
          `Filtering similar entry for title '${listing.title}' and address '${listing.address}' (Provider: '${this._providerId}')`,
        );
      }
      return !similar;
    });
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
