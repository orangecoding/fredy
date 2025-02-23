import { JSONFileSync } from 'lowdb/node';
import { getDirName } from '../../utils.js';
import path from 'path';
import LowdashAdapter from './LowDashAdapter.js';

const file = path.join(getDirName(), '../', 'db/jobListingData.json');
const adapter = new JSONFileSync(file);
const db = new LowdashAdapter(adapter, {});

db.read();

const buildKey = (jobKey: any, providerId: any, endpoint: any) => {
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
export const getNumberOfAllKnownListings = (jobId: any) => {
  const data = db.chain.get(`${jobId}.providerData`).value() || {};
  return Object.values(data)
    // @ts-expect-error TS(2769): No overload matches this call.
    .map((values) => Object.keys(values).length)
    .reduce((accumulator, currentValue) => accumulator + currentValue, 0);
};
export const getListingProviderDataForAnalytics = (jobId: any) => {
  // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
  const key = buildKey(jobId, 'providerData');
  return db.chain.get(key).value() || {};
};
export const getKnownListings = (jobId: any, providerId: any) => {
  // @ts-expect-error TS(2554): Expected 3 arguments, but got 4.
  const providerListingsKey = buildKey(jobId, 'providerData', providerId, 'listings');
  return db.chain.get(providerListingsKey).value() || {};
};
export const setKnownListings = (jobId: any, providerId: any, listings: any) => {
  // @ts-expect-error TS(2554): Expected 3 arguments, but got 4.
  const providerListingsKey = buildKey(jobId, 'providerData', providerId, 'listings');
  db.chain.set(providerListingsKey, listings).value();
  return db.write();
};
export const setLastJobExecution = (jobId: any) => {
  const key = buildKey(jobId, null, 'lastExecution');
  db.chain.set(key, Date.now()).value();
  return db.write();
};
export const removeListings = (jobId: any) => {
  db.chain.unset(jobId).value();
  db.write();
};
