import { NoNewListingsWarning } from './errors.js';
import { setKnownListings, getKnownListings } from './services/storage/listingsStorage.js';
import * as notify from './notification/notify.js';
import xray from './services/scraper.js';
import * as scrapingAnt from './services/scrapingAnt.js';
import urlModifier from './services/queryStringMutator.js';
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
  _getListings(url) {
    return new Promise((resolve, reject) => {
      const id = this._providerId;
      if (scrapingAnt.needScrapingAnt(id) && !scrapingAnt.isScrapingAntApiKeySet()) {
        const error = 'Immoscout or Immonet can only be used with if you have set an apikey for scrapingAnt.';
        /* eslint-disable no-console */
        console.log(error);
        /* eslint-enable no-console */
        reject(error);
        return;
      }
      const u = scrapingAnt.needScrapingAnt(id) ? scrapingAnt.transformUrlForScrapingAnt(url, id) : url;
      try {
        if (this._providerConfig.paginate != null) {
          xray(u, this._providerConfig.crawlContainer, [this._providerConfig.crawlFields])
            //the first 2 pages should be enough here
            .limit(2)
            .paginate(this._providerConfig.paginate)
            .then((listings) => {
              resolve(listings == null ? [] : listings);
            })
            .catch((err) => {
              reject(err);
              console.error(err);
            });
        } else {
          xray(u, this._providerConfig.crawlContainer, [this._providerConfig.crawlFields])
            .then((listings) => {
              resolve(listings == null ? [] : listings);
            })
            .catch((err) => {
              reject(err);
              console.error(err);
            });
        }
      } catch (error) {
        reject(error);
        console.error(error);
      }
    });
  }
  _normalize(listings) {
    return listings.map(this._providerConfig.normalize);
  }
  _filter(listings) {
    return listings.filter(this._providerConfig.filter);
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
  _handleError(err) {
    if (err.name !== 'NoNewListingsWarning') console.error(err);
  }
}
export default FredyRuntime;
