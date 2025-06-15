import { JSONFileSync } from 'lowdb/node';
import { getDirName } from '../../utils.js';
import path from 'path';
import LowdashAdapter from './LowDashAdapter.js';
import fs from 'fs';

const DB_DIR = path.join(getDirName(), '../', 'db/enhanced-listings');

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const getDbForJob = (jobId) => {
  const file = path.join(DB_DIR, `${jobId}.json`);
  const adapter = new JSONFileSync(file);
  const db = new LowdashAdapter(adapter);
  db.read();
  return db;
};

export const init = (jobId) => {
  const db = getDbForJob(jobId);
  const enhancedListings = db.chain.get('enhancedListings').value();
  
  if (enhancedListings === undefined) {
    db.chain.set('enhancedListings', []).value();
    db.write();
  } else {
    console.log('Database already initialized for job ', jobId);
  }
};

export const addListings = (jobId, listings) => {
  const db = getDbForJob(jobId);
  const currentListings = db.chain.get('enhancedListings').value() || [];
  
  // Add new listings, avoiding duplicates based on URL
  const existingUrls = new Set(currentListings.map(l => l.url));
  const newListings = listings.filter(l => !existingUrls.has(l.url));
  
  db.chain.set('enhancedListings', [...currentListings, ...newListings]).value();
  db.write();
};

export const getListings = (jobId) => {
  const db = getDbForJob(jobId);
  return db.chain.get('enhancedListings').value() || [];
};

export const getListingByUrl = (jobId, url) => {
  const db = getDbForJob(jobId);
  return db.chain.get('enhancedListings').find(l => l.url === url).value() || null;
};

export const deleteAllListings = (jobId) => {
  const db = getDbForJob(jobId);
  db.chain.set('enhancedListings', []).value();
  db.write();
};

export const deleteJobFile = (jobId) => {
  const file = path.join(DB_DIR, `${jobId}.json`);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
};

export const getSchema = (jobId) => {
  const db = getDbForJob(jobId);
  const listings = db.chain.get('enhancedListings').value() || [];
  
  // Get all unique keys from all listings
  const schema = new Set();
  listings.forEach(listing => {
    Object.keys(listing).forEach(key => schema.add(key));
  });
  
  return Array.from(schema);
}; 