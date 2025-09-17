import { nullOrEmpty } from '../../utils.js';
import SqliteConnection from './SqliteConnection.js';
import { nanoid } from 'nanoid';

export const getListingProviderDataForAnalytics = (jobId) => {
  const row = SqliteConnection.query(
    `SELECT json_group_object(
              provider,
              json_object(hash, created_at)
            ) AS result
     FROM listings where job_id = @jobId;`,
    { jobId },
  );

  return row?.length > 0 ? JSON.parse(row[0].result) : {};
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
