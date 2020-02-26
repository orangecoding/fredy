const { NoNewListingsError } = require('./errors');
const {
  setKnownListings,
  getKnownListings,
  setNumberOfTotalFoundProviderListings,
  getForTesting
} = require('./services/store');

const notify = require('./notification/notify');
const xray = require('./services/scraper');

class FredyRuntime {
  /**
   *
   * @param providerConfig the config for the specific provider, we're going to query at the moment
   * @param notificationConfig the config for all notifications (because all could be applied to a provider)
   * @param providerId the id of the provider currently in use
   * @param jobKey key of the job that is currently running (from within the config)
   */
  constructor(providerConfig, notificationConfig, providerId, jobKey) {
    this._providerConfig = providerConfig;
    this._notificationConfig = notificationConfig;
    this._providerId = providerId;
    this._jobKey = jobKey;
  }

  execute() {
    if (!this._providerConfig.enabled) return Promise.resolve();

    return (
      Promise.resolve(this._providerConfig.url)
        //scraping the site and try finding new listings
        .then(this._getListings.bind(this))
        //bring them in a proper form (dictated by the provider)
        .then(this._normalize.bind(this))
        //filter listings with stuff tagged by the blacklist of the provider
        .then(this._filter.bind(this))
        //check if new listings available. if so proceed
        .then(this._findNew.bind(this))
        //store update of number of found listings
        .then(this._storeStats.bind(this))
        //store everything in db
        .then(this._save.bind(this))
        //notify the user using the configured notification adapter
        .then(this._notify.bind(this))
        //if an error occurred on the way, handle it here.
        .catch(this._handleError.bind(this))
    );
  }

  _getListings(url) {
    return new Promise((resolve, reject) => {
      let x = xray(url, this._providerConfig.crawlContainer, [this._providerConfig.crawlFields]);

      if (this._providerConfig.paginage) {
        x = x.paginate(this._providerConfig.paginage);
      }

      x((err, listings) => {
        if (err) reject(err);
        else {
          resolve(listings);
        }
      });
    });
  }

  _storeStats(listings) {
    setNumberOfTotalFoundProviderListings(this._jobKey, this._providerId, listings.length);
    return Promise.resolve(listings);
  }

  _normalize(listings) {
    return listings.map(this._providerConfig.normalize);
  }

  _filter(listings) {
    return listings.filter(this._providerConfig.filter);
  }

  _findNew(listings) {
    const newListings = listings.filter(o => getKnownListings(this._jobKey, this._providerId).indexOf(o.id) === -1);

    if (newListings.length === 0) {
      throw new NoNewListingsError();
    }

    return newListings;
  }

  _notify(newListings) {
    const sendNotifications = notify.send(this._providerId, newListings, this._notificationConfig);
    return Promise.all(sendNotifications).then(() => newListings);
  }

  _save(newListings) {
    setKnownListings(this._jobKey, this._providerId, [
      ...getKnownListings(this._jobKey, this._providerId),
      ...newListings.map(l => l.id)
    ]);
    return newListings;
  }

  _handleError(err) {
    if (err.name !== 'NoNewListingsError') console.error(err);
  }

  /**
   * for testing purposes only
   * @returns {Store}
   * @private
   */
  _getStore() {
    return getForTesting();
  }
}

module.exports = FredyRuntime;
