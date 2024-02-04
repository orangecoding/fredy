import { NoNewListingsWarning } from './errors.js';
import { setKnownListings, getKnownListings } from './services/storage/listingsStorage.js';
import * as notify from './notification/notify.js';
import * as process from './processors/process.js';
import xray from './services/scraper.js';
import * as scrapingAnt from './services/scrapingAnt.js';
import urlModifier from './services/queryStringMutator.js';
import { Listing, ProviderConfig } from './provider/provider.js';
import { SimilarityCacheService } from './services/similarity-check/similarityCache.js';

class FredyRuntime {
  private providerConfig: ProviderConfig;
  private notificationAdapterConfigs: notify.NotifierAdapterConfig[];
  private providerId: string;
  private jobKey: string;
  private similarityCache: SimilarityCacheService;
  private listingProcessors?: process.ProcessorConfig[];

  /**
   *
   * @param providerConfig the config for the specific provider, we're going to query at the moment
   * @param notificationConfig the config for all notifications
   * @param providerId the id of the provider currently in use
   * @param jobKey key of the job that is currently running (from within the config)
   * @param similarityCache cache instance holding values to check for similarity of entries
   */
  constructor(
    providerConfig: ProviderConfig,
    notificationConfig: notify.NotifierAdapterConfig[],
    providerId: string,
    jobKey: string,
    similarityCache: SimilarityCacheService,
    listingProcessors?: process.ProcessorConfig[]
  ) {
    this.providerConfig = providerConfig;
    this.notificationAdapterConfigs = notificationConfig;
    this.providerId = providerId;
    this.jobKey = jobKey;
    this.similarityCache = similarityCache;
    this.listingProcessors = listingProcessors;
    console.log('Setup freddy runtime');
  }
  execute() {
    return (
      //modify the url to make sure search order is correctly set
      Promise.resolve(urlModifier(this.providerConfig.url, this.providerConfig.sortByDateParam))
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
        .then(this._processListings.bind(this))
        //notify the user using the configured notification adapter
        .then(this._notify.bind(this))
        //if an error occurred on the way, handle it here.
        .catch(this._handleError.bind(this))
    );
  }
  _getListings(url: string) {
    return new Promise((resolve, reject) => {
      const id = this.providerId;
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
        const xrayPromise = xray(u, this.providerConfig.crawlContainer, [this.providerConfig.crawlFields]);

        if (this.providerConfig.paginate != null) {
          //the first 2 pages should be enough here
          xrayPromise.limit(2).paginate(this.providerConfig.paginate);
        }

        xrayPromise
          .then((listings) => {
            resolve(listings == null ? [] : listings);
          })
          .catch((err) => {
            reject(err);
            console.error(err);
          });
      } catch (error) {
        reject(error);
        console.error(error);
      }
    });
  }

  _normalize(listings: Listing[]): Listing[] {
    return listings.map(this.providerConfig.normalize);
  }
  _filter(listings: Listing[]): Listing[] {
    return listings.filter(this.providerConfig.filter);
  }
  _findNew(listings: Listing[]): Listing[] {
    const newListings = listings.filter((o) => getKnownListings(this.jobKey, this.providerId)[o.id] == null);
    if (newListings.length === 0) {
      throw new NoNewListingsWarning();
    }
    return newListings;
  }
  _notify(newListings: Listing[]): Promise<Listing[]> {
    if (newListings.length === 0) {
      throw new NoNewListingsWarning();
    }
    const sendNotifications = notify.send({
      serviceName: this.providerId,
      newListings,
      notificationConfig: this.notificationAdapterConfigs,
      jobKey: this.jobKey,
    });
    return Promise.all(sendNotifications).then(() => newListings);
  }
  _save(newListings: Listing[]): Listing[] {
    const currentListings = getKnownListings(this.jobKey, this.providerId) || {};
    newListings.forEach((listing) => {
      currentListings[listing.id] = Date.now();
    });
    setKnownListings(this.jobKey, this.providerId, currentListings);
    return newListings;
  }
  _filterBySimilarListings(listings: Listing[]): Listing[] {
    const filteredList = listings.filter((listing) => {
      const similar = this.similarityCache.hasSimilarEntries(this.jobKey, listing.title);

      if (similar) {
        /* eslint-disable no-console */
        console.debug(`Filtering similar entry for job with id ${this.jobKey} with title: `, listing.title);
        /* eslint-enable no-console */
      }
      return !similar;
    });
    filteredList.forEach((filter) => this.similarityCache.addCacheEntry(this.jobKey, filter.title));
    return filteredList;
  }

  _processListings(listings: Listing[]): Promise<Listing[]> {
    return process.processListings(listings, this.listingProcessors);
  }

  _handleError(err: Error) {
    if (err.name !== 'NoNewListingsWarning') console.error(err);
  }
}
export default FredyRuntime;
