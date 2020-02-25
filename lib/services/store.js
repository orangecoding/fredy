const path = require('path');
const DB_PATH = path.dirname(require.main.filename) + '/conf/store.json';

const FileAsync = require('lowdb/adapters/FileAsync');
const adapter = new FileAsync(DB_PATH);
const low = require('lowdb');

const lowdb = low(adapter);

let db = null;

const buildKey = (jobKey, providerId, endpoint) => {
  let key = `${jobKey}`;
  if (jobKey == null && endpoint == null) {
    return key;
  }
  if (providerId != null) {
    key += `.${providerId}`;
  }
  if (endpoint != null) {
    key += `.${endpoint}`;
  }
  return key;
};

exports.init = () => {
  return new Promise(resolve => {
    //warmup
    lowdb.then(database => {
      db = database;
      /* eslint-disable no-console */
      console.info('Warming up database successful');
      /* eslint-enable no-console */
      resolve();
    });
  });
};

exports.setKnownListings = (jobKey, providerId, listings) => {
  if (!Array.isArray(listings)) throw Error('Not a valid array');
  const providerListingsKey = buildKey(jobKey, providerId, 'listings');
  const providerLastScrapeKey = buildKey(jobKey, providerId, 'lastProviderExecution');

  return db
    .set(providerListingsKey, listings)
    .set(providerLastScrapeKey, Date.now())
    .write();
};

exports.setNumberOfTotalFoundProviderListings = (jobKey, providerId, numberOfNewListings) => {
  if (numberOfNewListings > 0) {
    const numberOfFoundListingsKey = buildKey(jobKey, providerId, 'foundListings');
    const currentNumber = db.get(numberOfFoundListingsKey).value() || 0;
    db.set(numberOfFoundListingsKey, currentNumber + numberOfNewListings).write();
  }
};

exports.setLastJobExecution = jobKey => {
  const key = buildKey(jobKey, null, 'lastJobExecution');
  return db.set(key, Date.now()).write();
};

exports.getKnownListings = (jobKey, providerId) => {
  const providerListingsKey = buildKey(jobKey, providerId, 'listings');
  return db.get(providerListingsKey).value() || [];
};

exports.getLastProviderExecution = (jobKey, providerId) => {
  const key = buildKey(jobKey, providerId, 'lastProviderExecution');
  return db.get(key).value() || 0;
};

exports.getLastJobExecution = jobKey => {
  const key = buildKey(jobKey, null, 'lastJobExecution');
  return db.get(key).value() || 0;
};

exports.getTotalNumberOfListings = (jobKey, providerId) => {
  const key = buildKey(jobKey, providerId, 'foundListings');
  return db.get(key).value() || 0;
};
