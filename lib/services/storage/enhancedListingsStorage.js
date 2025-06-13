import { JSONFileSync } from 'lowdb/node';
import { getDirName } from '../../utils.js';
import path from 'path';
import LowdashAdapter from './LowDashAdapter.js';

const file = path.join(getDirName(), '../', 'db/enhanced-listings.json');
const adapter = new JSONFileSync(file);
const db = new LowdashAdapter(adapter, {});

db.read();

export const init = (jobId) => {
  const key = `${jobId}.listings`;
  if (!db.chain.get(key).value()) {
    db.chain.set(key, []).value();
    db.write();
  }
};

export const addListings = (jobId, listings) => {
  const key = `${jobId}.listings`;
  const currentListings = db.chain.get(key).value() || [];
  
  // Add new listings, avoiding duplicates based on URL
  const existingUrls = new Set(currentListings.map(l => l.url));
  const newListings = listings.filter(l => !existingUrls.has(l.url));
  
  db.chain.set(key, [...currentListings, ...newListings]).value();
  db.write();
};

export const getListings = (jobId) => {
  const key = `${jobId}.listings`;
  return db.chain.get(key).value() || [];
};

export const getListingByUrl = (jobId, url) => {
  const key = `${jobId}.listings`;
  return db.chain.get(key).find(l => l.url === url).value() || null;
};

export const deleteAllListings = (jobId) => {
  const key = `${jobId}.listings`;
  db.chain.set(key, []).value();
  db.write();
}; 