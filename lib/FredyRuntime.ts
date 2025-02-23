import { NoNewListingsWarning } from './errors';
import { setKnownListings, getKnownListings } from './services/storage/listingsStorage';
import * as notify from './notification/notify';
import Extractor from './services/extractor/extractor';
import urlModifier from './services/queryStringMutator';
import { ProviderConfig } from '#types/ProviderConfig.js';
import { SimilarityCache } from '#services/similarity-check/similarityCache.js';
import { NotificationAdapterConfig } from '#types/NotificationAdapter.js';
import { Listing } from '#types/Listings.ts';

class FredyRuntime {
  _jobKey: string;
  _notificationConfig: NotificationAdapterConfig[];
  _providerConfig: ProviderConfig;
  _providerId: string;
  _similarityCache: SimilarityCache;
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
    notificationConfig: NotificationAdapterConfig[],
    providerId: string,
    jobKey: string,
    similarityCache: SimilarityCache,
  ) {
    this._providerConfig = providerConfig;
    this._notificationConfig = notificationConfig;
    this._providerId = providerId;
    this._jobKey = jobKey;
    this._similarityCache = similarityCache;
  }

  execute() {
    return (
      //modify the url to make sure search order is correctly set
      Promise.resolve(urlModifier(this._providerConfig.url ?? '', this._providerConfig.sortByDateParam))
        //scraping the site and try finding new listings
        .then(this._getListings.bind(this))
        //bring them in a proper form (dictated by the provider)
        .then((value: Listing[] | void) => this._normalize(value as Listing[]))
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

  _getListings(url: string): Promise<Listing[]> {
    const extractor = new Extractor({});
    return new Promise((resolve, reject) => {
      extractor
        .execute(url, this._providerConfig.waitForSelector ?? null)
        .then(() => {
          const listings: Listing[] = extractor.parseResponseText(
            this._providerConfig.crawlContainer,
            this._providerConfig.crawlFields,
            url,
          );
          resolve(listings == null ? [] : listings);
        })
        .catch((err: unknown) => {
          reject(err);
          console.error(err);
        });
    });
  }

  _normalize(listings: Listing[]): Listing[] {
    return listings.map(this._providerConfig.normalize);
  }

  _filter(listings: Listing[]): Listing[] {
    //only return those where all the fields have been found
    const keys = Object.keys(this._providerConfig.crawlFields);
    const filteredListings = listings.filter((item) => keys.every((key) => key in item));
    return filteredListings.filter(this._providerConfig.filter);
  }

  _findNew(listings: Listing[]): Listing[] {
    const newListings: Listing[] = listings.filter(
      (o) => getKnownListings(this._jobKey, this._providerId)[o.id!] == null,
    );
    if (newListings.length === 0) {
      throw new NoNewListingsWarning('No new listings found');
    }
    return newListings;
  }

  _notify(newListings: Listing[]): Promise<Listing[]> {
    if (newListings.length === 0) {
      throw new NoNewListingsWarning('No new listings found');
    }

    const listingsForNotification: Listing[] = newListings.map((listing) => ({
      id: listing.id!,
      price: listing.price ?? 'N/A',
      title: listing.title ?? 'N/A',
      address: listing.address ?? 'N/A',
      size: listing.size ?? 'N/A',
      link: listing.link ?? 'N/A',
    }));

    const sendNotifications = notify.send(
      this._providerId,
      listingsForNotification,
      this._notificationConfig,
      this._jobKey,
    );
    return Promise.all(sendNotifications).then(() => newListings);
  }

  _save(newListings: Listing[]): Listing[] {
    const currentListings = getKnownListings(this._jobKey, this._providerId) || {};
    newListings.forEach((listing) => {
      currentListings[listing.id!] = Date.now();
    });
    setKnownListings(this._jobKey, this._providerId, currentListings);
    return newListings;
  }

  _filterBySimilarListings(listings: Listing[]): Listing[] {
    const filteredList = listings.filter((listing) => {
      const similar = this._similarityCache.hasSimilarEntries(this._jobKey, listing.title || 'N/A');
      if (similar) {
        /* eslint-disable no-console */
        console.debug(`Filtering similar entry for job with id ${this._jobKey} with title: `, listing.title);
        /* eslint-enable no-console */
      }
      return !similar;
    });
    filteredList.forEach((filter) => this._similarityCache.addCacheEntry(this._jobKey, filter.title || 'N/A'));
    return filteredList;
  }

  _handleError(err: Error) {
    if (err.name !== 'NoNewListingsWarning') console.error(err);
  }
}

export default FredyRuntime;
