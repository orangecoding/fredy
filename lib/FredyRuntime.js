import { NoNewListingsWarning } from './utils/errors.js';
import { setKnownListings, getKnownListings } from './services/storage/listingsStorage.js';
import * as notify from './notification/notify.js';
import SearchExtractor from './services/extractor/searchExtractor.js';
import ListingExtractor from './services/extractor/exposeExtractor.js';
import urlModifier from './services/queryStringMutator.js';
import ExposeExtractor from './services/extractor/exposeExtractor.js';
import * as enhancedListingsStorage from './services/storage/enhancedListingsStorage.js';
import WaypointCalculator from './services/waypoint-calculator/waypointCalculator.js';
import * as jobStorage from './services/storage/jobStorage.js';
import logger from './utils/logger.js';

class FredyRuntime {
  /**
   *
   * @param providerConfig the config for the specific provider, we're going to query at the moment
   * @param notificationConfig the config for all notifications
   * @param providerId the id of the provider currently in use
   * @param jobKey key of the job that is currently running (from within the config)
   * @param similarityCache cache instance holding values to check for similarity of entries
   */
  constructor(providerConfig, notificationConfig, providerId, jobKey, similarityCache) {
    this._providerConfig = providerConfig;
    this._notificationConfig = notificationConfig;
    this._providerId = providerId;
    this._jobKey = jobKey;
    this._similarityCache = similarityCache;
  }

  execute() {
    return (
      //modify the url to make sure search order is correctly set
      Promise.resolve(urlModifier(this._providerConfig.url, this._providerConfig.sortByDateParam))
        //scraping the site and try finding new listings
        .then(async (url) => {
          logger.info('Starting getListings step', { url });
          const listings = await (this._providerConfig.getListings?.bind(this) ?? this._getListings.bind(this))(url);
          logger.info('Completed getListings step', { listingsCount: listings?.length || 0 });
          return listings;
        })
        //bring them in a proper form (dictated by the provider)
        .then(async (listings) => {
          logger.info('Starting normalize step', { inputListingsCount: listings?.length || 0 });
          const normalized = await this._normalize.bind(this)(listings);
          logger.info('Completed normalize step', { outputListingsCount: normalized?.length || 0 });
          return normalized;
        })
        //filter listings with stuff tagged by the blacklist of the provider
        .then(async (listings) => {
          logger.info('Starting filter step', { inputListingsCount: listings?.length || 0 });
          const filtered = await this._filter.bind(this)(listings);
          logger.info('Completed filter step', { outputListingsCount: filtered?.length || 0 });
          return filtered;
        })
        //check if new listings available. if so proceed
        .then(async (listings) => {
          logger.info('Starting findNew step', { inputListingsCount: listings?.length || 0 });
          const newListings = await this._findNew.bind(this)(listings);
          logger.info('Completed findNew step', { outputListingsCount: newListings?.length || 0 });
          return newListings;
        })
        //store everything in db
        .then(async (listings) => {
          logger.info('Starting save step', { inputListingsCount: listings?.length || 0 });
          const saved = await this._save.bind(this)(listings);
          logger.info('Completed save step', { outputListingsCount: saved?.length || 0 });
          return saved;
        })
        //check for similar listings. if found, remove them before notifying
        .then(async (listings) => {
          logger.info('Starting filterBySimilarListings step', { inputListingsCount: listings?.length || 0 });
          const filtered = await this._filterBySimilarListings.bind(this)(listings);
          logger.info('Completed filterBySimilarListings step', { outputListingsCount: filtered?.length || 0 });
          return filtered;
        })
        //notify the user using the configured notification adapter
        .then(async (listings) => {
          logger.info('Starting notify step', { inputListingsCount: listings?.length || 0 });
          const notified = await this._notify.bind(this)(listings);
          logger.info('Completed notify step', { outputListingsCount: notified?.length || 0 });
          return notified;
        })
        //enhance listings with full website content
        .then(async (listings) => {
          logger.info('Starting enhanceListings step', { inputListingsCount: listings?.length || 0 });
          const enhanced = await this._enhanceListings.bind(this)(listings);
          logger.info('Completed enhanceListings step', { outputListingsCount: enhanced?.length || 0 });
          return enhanced;
        })
        //calculate waypoints
        .then(async (listings) => {
          logger.info('Starting calculateWaypoints step', { inputListingsCount: listings?.length || 0 });
          const withWaypoints = await this._calculateWaypoints.bind(this)(listings);
          logger.info('Completed calculateWaypoints step', { outputListingsCount: withWaypoints?.length || 0 });
          return withWaypoints;
        })
        //store enhanced listings in persistent storage 
        .then(async (listings) => {
          logger.info('Starting storeEnhancedListings step', { inputListingsCount: listings?.length || 0 });
          const stored = await this._storeEnhancedListings.bind(this)(listings);
          logger.info('Completed storeEnhancedListings step', { outputListingsCount: stored?.length || 0 });
          return stored;
        })
        //if an error occurred on the way, handle it here.
        .catch((error) => {
          logger.error('Error in FredyRuntime execution', { error: error.message, stack: error.stack });
          return this._handleError.bind(this)(error);
        })
    );
  }

  _getListings(url) {
    const extractor = new SearchExtractor();
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
          /* eslint-disable no-console */
          console.error(err);
          /* eslint-enable no-console */
        });
    });
  }

  _normalize(listings) {
    // First normalize using provider's normalize function
    const normalizedListings = listings.map(this._providerConfig.normalize);
    
    // Then ensure all basic fields exist
    return normalizedListings.map(listing => enhancedListingsStorage.ensureBasicFields(listing));
  }

  _filter(listings) {
    //only return those where all the fields have been found
    const keys = Object.keys(this._providerConfig.crawlFields);
    const filteredListings = listings.filter((item) => keys.every((key) => key in item));
    return filteredListings.filter(this._providerConfig.filter);
  }

  _findNew(listings) {
    const newListings = listings.filter((o) => getKnownListings(this._jobKey, this._providerId)[o.id] == null);
    if (newListings.length === 0) {
      throw new NoNewListingsWarning();
    }
    return newListings;
  }

  _notify(newListings) {
    if (newListings.length === 0) {
      throw new NoNewListingsWarning();
    }
    const sendNotifications = notify.send(this._providerId, newListings, this._notificationConfig, this._jobKey);
    return Promise.all(sendNotifications).then(() => newListings);
  }

  _save(newListings) {
    const currentListings = getKnownListings(this._jobKey, this._providerId) || {};
    const now = Date.now();
    newListings.forEach((listing) => {
      currentListings[listing.id] = now;
      listing.date_found = now;
    });
    setKnownListings(this._jobKey, this._providerId, currentListings);
    return newListings;
  }

  _filterBySimilarListings(listings) {
    const filteredList = listings.filter((listing) => {
      const similar = this._similarityCache.hasSimilarEntries(this._jobKey, listing.title);
      if (similar) {
        /* eslint-disable no-console */
        console.debug(`Filtering similar entry for job with id ${this._jobKey} with title: `, listing.title);
        /* eslint-enable no-console */
      }
      return !similar;
    });
    filteredList.forEach((filter) => this._similarityCache.addCacheEntry(this._jobKey, filter.title));
    return filteredList;
  }

  _enhanceListings(listings) {
    const job = jobStorage.getJob(this._jobKey);
    if (!job?.customFields?.length) {
      return listings;
    }

    const extractor = new ExposeExtractor();
    
    // Process listings sequentially with delay
    return listings.reduce(async (promise, listing) => {
      // Wait for the previous listing to complete
      const results = await promise;
      
      // Add a random delay between requests (2-7 seconds)
      const delay = Math.floor(Math.random() * (10001 - 3000) + 2000);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Process the current listing
      const enhancedListing = await extractor
        .processExpose(listing, this._providerConfig, this._jobKey)
        .then((enhancedData) => ({
          ...enhancedData,
          ...listing, // Original listing data takes precedence (overwrites enhanced data)
        }))
        .catch((error) => {
          logger.error(`Failed to enhance listing ${listing.id}:`, error);
          return listing; // Return original listing if enhancement fails
        });
      
      return [...results, enhancedListing];
    }, Promise.resolve([]));
  }

  async _storeEnhancedListings(enhancedListings) {
    if (enhancedListings && enhancedListings.length > 0) {
      await enhancedListingsStorage.addListings(this._jobKey, enhancedListings);
    }
    return enhancedListings; // Pass along for any further steps
  }

  async _calculateWaypoints(enhancedListings) {
    const job = jobStorage.getJob(this._jobKey);
    if (!job?.waypoints?.length) {
      return enhancedListings;
    }

    const waypointCalculator = new WaypointCalculator();
    return Promise.all(
      enhancedListings.map(listing =>
        waypointCalculator
          .calculateTravelTimes(listing, job.waypoints)
          .catch(error => {
            console.error(`Failed to calculate waypoints for listing ${listing.id}:`, error);
            return listing;
          })
      )
    );
  }

  _handleError(err) {
    if (err.name === 'NoNewListingsWarning' || err instanceof NoNewListingsWarning) {
      logger.info('No new listings found for this job');
    } else {
      logger.error('Error in FredyRuntime execution', { error: err.message, stack: err.stack });
    }
  }
}

export default FredyRuntime;
