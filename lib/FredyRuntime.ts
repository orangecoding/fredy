import { NoNewListingsWarning } from './errors.js';
import { setKnownListings, getKnownListings } from './services/storage/listingsStorage.js';
import * as notify from './notification/notify.js';
import Extractor from './services/extractor/extractor.js';
import urlModifier from './services/queryStringMutator.js';

class FredyRuntime {
  _jobKey: any;
  _notificationConfig: any;
  _providerConfig: any;
  _providerId: any;
  _similarityCache: any;
  /**
   *
   * @param providerConfig the config for the specific provider, we're going to query at the moment
   * @param notificationConfig the config for all notifications
   * @param providerId the id of the provider currently in use
   * @param jobKey key of the job that is currently running (from within the config)
   * @param similarityCache cache instance holding values to check for similarity of entries
   */
  constructor(providerConfig: any, notificationConfig: any, providerId: any, jobKey: any, similarityCache: any) {
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
        .then(this._getListings.bind(this))
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
        //notify the user using the configured notification adapter
        .then(this._notify.bind(this))
        //if an error occurred on the way, handle it here.
        .catch(this._handleError.bind(this))
    );
  }

  _getListings(url: any) {
    // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
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
          /* eslint-disable no-console */
          console.error(err);
          /* eslint-enable no-console */
        });
    });
  }

  _normalize(listings: any) {
    return listings.map(this._providerConfig.normalize);
  }

  _filter(listings: any) {
    //only return those where all the fields have been found
    const keys = Object.keys(this._providerConfig.crawlFields);
    const filteredListings = listings.filter((item: any) => keys.every((key) => key in item));
    return filteredListings.filter(this._providerConfig.filter);
  }

  _findNew(listings: any) {
    const newListings = listings.filter((o: any) => getKnownListings(this._jobKey, this._providerId)[o.id] == null);
    if (newListings.length === 0) {
      // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
      throw new NoNewListingsWarning();
    }
    return newListings;
  }

  _notify(newListings: any) {
    if (newListings.length === 0) {
      // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
      throw new NoNewListingsWarning();
    }
    const sendNotifications = notify.send(this._providerId, newListings, this._notificationConfig, this._jobKey);
    return Promise.all(sendNotifications).then(() => newListings);
  }

  _save(newListings: any) {
    const currentListings = getKnownListings(this._jobKey, this._providerId) || {};
    newListings.forEach((listing: any) => {
      currentListings[listing.id] = Date.now();
    });
    setKnownListings(this._jobKey, this._providerId, currentListings);
    return newListings;
  }

  _filterBySimilarListings(listings: any) {
    const filteredList = listings.filter((listing: any) => {
      const similar = this._similarityCache.hasSimilarEntries(this._jobKey, listing.title);
      if (similar) {
        /* eslint-disable no-console */
        console.debug(`Filtering similar entry for job with id ${this._jobKey} with title: `, listing.title);
        /* eslint-enable no-console */
      }
      return !similar;
    });
    filteredList.forEach((filter: any) => this._similarityCache.addCacheEntry(this._jobKey, filter.title));
    return filteredList;
  }

  _handleError(err: any) {
    if (err.name !== 'NoNewListingsWarning') console.error(err);
  }
}

export default FredyRuntime;
