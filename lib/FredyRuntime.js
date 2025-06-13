import { NoNewListingsWarning } from './errors.js';
import { setKnownListings, getKnownListings } from './services/storage/listingsStorage.js';
import * as notify from './notification/notify.js';
import SearchExtractor from './services/extractor/searchExtractor.js';
import ListingExtractor from './services/extractor/exposeExtractor.js';
import urlModifier from './services/queryStringMutator.js';
import ExposeExtractor from './services/extractor/exposeExtractor.js';
import * as enhancedListingsStorage from './services/storage/enhancedListingsStorage.js';

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
        .then(this._providerConfig.getListings?.bind(this) ?? this._getListings.bind(this))
        //bring them in a proper form (dictated by the provider)
        .then(this._normalize.bind(this))
        //filter listings with stuff tagged by the blacklist of the provider
        .then(this._filter.bind(this))
        //check if new listings available. if so proceed
        .then(this._findNew.bind(this))
        //store everything in db
        .then(this._save.bind(this))
        //check for similar listings. if found, remove them before notifying
        .then(this._filterBySimilarListings.bind(this))
        //enhance listings with full website content
        .then(this._enhanceListings.bind(this))
        //notify the user using the configured notification adapter
        .then(this._notify.bind(this))
        //store enhanced listings in persistent storage 
        .then(() => this._storeEnhancedListings())
        //if an error occurred on the way, handle it here.
        .catch(this._handleError.bind(this))
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
    return listings.map(this._providerConfig.normalize);
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
    newListings.forEach((listing) => {
      currentListings[listing.id] = Date.now();
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
    const extractor = new ExposeExtractor();
    return Promise.all(
      listings.map((listing) =>
        extractor
          .processExpose(listing, this._providerConfig, this._jobKey)
          .then((enhancedData) => ({
            ...enhancedData,
            ...listing, // Original listing data takes precedence (overwrites enhanced data)
          }))
          .catch((error) => {
            console.error(`Failed to enhance listing ${listing.id}:`, error);
            return listing; // Return original listing if enhancement fails
          })
      )
    );
  }

  async _storeEnhancedListings() {
    if (this._enhancedListings && this._enhancedListings.length > 0) {
      await enhancedListingsStorage.addListings(this._jobKey, this._enhancedListings);
    }
  }

  _handleError(err) {
    if (err.name !== 'NoNewListingsWarning') console.error(err);
  }
}

export default FredyRuntime;
