import { JSONFileSync } from 'lowdb/node';
import { getDirName } from '../../utils';
import path from 'path';
import LowdashAdapter from './LowDashAdapter';
import { KnownListingsDb, KnownListingsDbListingList } from './types';

const file = path.join(getDirName(), '../', 'db/jobListingData.json');
const adapter: JSONFileSync<KnownListingsDb> = new JSONFileSync(file);
const db: LowdashAdapter<KnownListingsDb> = new LowdashAdapter(adapter, {});

db.read();

const buildKey = (jobKey: string | null, providerId: string | null, endpoint: string | null) => {
  let key: string = `${jobKey}`;
  if (jobKey == null && endpoint == null) return key;
  if (providerId != null) key += `.${providerId}`;
  if (endpoint != null) key += `.${endpoint}`;
  return key;
};
export const getNumberOfAllKnownListings = (jobId: string) => {
  const data: KnownListingsDbListingList =
    (db.chain.get(`${jobId}.providerData`).value() as unknown as KnownListingsDbListingList) ?? {};
  return Object.values(data)
    .map((values) => Object.keys(values).length)
    .reduce((accumulator, currentValue) => accumulator + currentValue, 0);
};

export const getListingProviderDataForAnalytics = (jobId: string) => {
  const key: string = buildKey(jobId, null, 'providerData');
  return (db.chain.get(key).value() as unknown as KnownListingsDbListingList) ?? {};
};

export const getKnownListings = (jobId: string, providerId: string) => {
  const providerListingsKey: string = buildKey(jobId, providerId, 'listings');
  return (db.chain.get(providerListingsKey).value() as unknown as KnownListingsDbListingList) ?? {};
};
export const setKnownListings = (jobId: string, providerId: string, listings: KnownListingsDbListingList) => {
  const providerListingsKey: string = buildKey(jobId, providerId, 'listings');
  db.chain.set(providerListingsKey, listings).value();
  db.write();
};
export const setLastJobExecution = (jobId: string) => {
  const key: string = buildKey(jobId, null, 'lastExecution');
  db.chain.set(key, Date.now()).value();
  db.write();
};
export const removeListings = (jobId: string) => {
  db.chain.unset(jobId).value();
  db.write();
};
