import { nullOrEmpty } from '../../utils.js';
import SqliteConnection from './SqliteConnection.js';
import { nanoid } from 'nanoid';

/**
 * Build analytics data for a given job by grouping all listings by provider and
 * mapping each listing hash to its creation timestamp.
 *
 * SQL shape:
 * SELECT json_group_object(provider, json_object(hash, created_at)) AS result
 * FROM listings WHERE job_id = @jobId;
 *
 * The resulting object has the shape:
 * {
 *   providerA: { "<hash1>": <created_at_ms>, "<hash2>": <created_at_ms>, ... },
 *   providerB: { ... }
 * }
 *
 * @param {string} jobId - ID of the job whose listings should be aggregated.
 * @returns {Record<string, Record<string, number>>} Object grouped by provider mapping listing-hash -> created_at epoch ms.
 */
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

/**
 * Return a list of known listing hashes for a given job and provider.
 * Useful to de-duplicate before inserting new listings.
 *
 * @param {string} jobId - The job identifier.
 * @param {string} providerId - The provider identifier (e.g., 'immoscout').
 * @returns {string[]} Array of listing hashes.
 */
export const getKnownListingHashesForJobAndProvider = (jobId, providerId) => {
  return SqliteConnection.query(
    `SELECT hash
     FROM listings
     WHERE job_id = @jobId AND provider = @providerId`,
    { jobId, providerId },
  ).map((r) => r.hash);
};

/**
 * Persist a batch of scraped listings for a given job and provider.
 *
 * - Empty or non-array inputs are ignored.
 * - Each listing is inserted with ON CONFLICT(hash) DO NOTHING to avoid duplicates.
 * - Performs inserts in a single transaction for performance.
 *
 * Listing input shape (minimal expected):
 * {
 *   id: string,            // unique id
 *   hash: string           // stable hash/id of the listing (used as unique hash)
 *   price?: string,        // e.g., "1.234 €" or "1,234€"
 *   size?: string,         // e.g., "70 m²"
 *   title?: string,
 *   image?: string,        // image URL
 *   description?: string,
 *   address?: string,      // free-text address possibly containing parentheses
 *   link?: string
 * }
 *
 * @param {string} jobId - The job identifier.
 * @param {string} providerId - The provider identifier.
 * @param {Array<Object>} listings - Array of listing objects as described above.
 * @returns {void}
 */
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

    // TODO: Derive city from address or add a dedicated field in providers
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

  /**
   * Extract the first number from a string like "1.234 €" or "70 m²".
   * Removes dots/commas before parsing. Returns null on invalid input.
   * @param {string|undefined|null} str
   * @returns {number|null}
   */
  function extractNumber(str) {
    if (!str) return null;
    const match = str.replace(/[.,]/g, '').match(/\d+/);
    return match ? +match[0] : null;
  }

  /**
   * Remove any parentheses segments (including surrounding whitespace) from a string.
   * Returns null for empty input.
   * @param {string|undefined|null} str
   * @returns {string|null}
   */
  function removeParentheses(str) {
    if (nullOrEmpty(str)) {
      return null;
    }
    return str.replace(/\s*\([^)]*\)/g, '');
  }
};
