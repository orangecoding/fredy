import { JSONFileSync } from 'lowdb/node';
import { getDirName, nullOrEmpty } from '../../utils.js';
import path from 'path';
import LowdashAdapter from './LowDashAdapter.js';
import SqliteConnection from './SqliteConnection.js';
import { nanoid } from 'nanoid';

const file = path.join(getDirName(), '../', 'db/jobListingData.json');
const adapter = new JSONFileSync(file);
const db = new LowdashAdapter(adapter, {});

db.read();

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

//TODO: Figuring this out
export const getListingProviderDataForAnalytics = (jobId) => {
  const key = buildKey(jobId, 'providerData');
  return db.chain.get(key).value() || {};
};

export const getKnownListingHashesForJobAndProvider = (jobId, providerId) => {
  return SqliteConnection.query(
    `SELECT hash
     FROM listings
     WHERE job_id = @jobId AND provider = @providerId`,
    { jobId, providerId },
  ).map((r) => r.hash);
};

export const storeListings = (jobId, providerId, listings) => {
  if (!Array.isArray(listings) || listings.length === 0) {
    return;
  }

  SqliteConnection.withTransaction((db) => {
    const stmt = db.prepare(
      `INSERT INTO listings (id, hash, provider, job_id, price, size, title, image_url, description, address, city,
                             link, created_at)
       VALUES (@id, @hash, @provider, @job_id, @price, @size, @title, @image_url, @description, @address, @city, @link,
               @created_at)
       ON CONFLICT(hash) DO NOTHING`,
    );

    //TODO: Adding city!
    for (const item of listings) {
      const params = {
        id: nanoid(),
        hash: item.id,
        provider: providerId,
        job_id: jobId,
        price: extractNumber(item.price),
        size: extractNumber(item.size),
        title: item.title,
        image_url: item.image,
        description: item.description,
        address: removeParentheses(item.address),
        city: 'TO BE DONE',
        link: item.link,
        created_at: Date.now(),
      };
      stmt.run(params);
    }
  });

  function extractNumber(str) {
    if (!str) return null;
    const match = str.replace(/[.,]/g, '').match(/\d+/);
    return match ? +match[0] : null;
  }

  function removeParentheses(str) {
    if (nullOrEmpty(str)) {
      return null;
    }
    return str.replace(/\s*\([^)]*\)/g, '');
  }
};
