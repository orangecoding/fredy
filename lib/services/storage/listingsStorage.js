const path = require('path');

const DB_PATH = path.dirname(require.main.filename) + '/db/jobListingData.json';
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync(DB_PATH);
const low = require('lowdb');
const db = low(adapter);

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

exports.getNumberOfAllKnownListings = (jobId) => {
  const data = db.get(`${jobId}.providerData`).value() || {};
  return Object.values(data)
    .map((values) => Object.keys(values).length)
    .reduce((accumulator, currentValue) => accumulator + currentValue, 0);
};

exports.getListingProviderDataForAnalytics = (jobId) => {
  const key = buildKey(jobId, 'providerData');
  return db.get(key).value() || {};
};

exports.getKnownListings = (jobId, providerId) => {
  const providerListingsKey = buildKey(jobId, 'providerData', providerId, 'listings');
  return db.get(providerListingsKey).value() || {};
};

exports.setKnownListings = (jobId, providerId, listings) => {
  const providerListingsKey = buildKey(jobId, 'providerData', providerId, 'listings');

  return db.set(providerListingsKey, listings).write();
};

exports.setLastJobExecution = (jobId) => {
  const key = buildKey(jobId, null, 'lastExecution');
  return db.set(key, Date.now()).write();
};
