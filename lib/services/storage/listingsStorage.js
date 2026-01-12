/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nullOrEmpty } from '../../utils.js';
import SqliteConnection from './SqliteConnection.js';
import { nanoid } from 'nanoid';

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
     WHERE job_id = @jobId
       AND provider = @providerId`,
    { jobId, providerId },
  ).map((r) => r.hash);
};

/**
 * Compute KPI aggregates for a given set of job IDs from the listings table.
 *
 * - numberOfActiveListings: count of listings where is_active = 1
 * - avgPriceOfListings: average of numeric price, rounded to nearest integer
 *
 * When no jobIds are provided, returns zeros.
 *
 * @param {string[]} jobIds
 * @returns {{ numberOfActiveListings: number, avgPriceOfListings: number }}
 */
export const getListingsKpisForJobIds = (jobIds = []) => {
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return { numberOfActiveListings: 0, avgPriceOfListings: 0 };
  }

  const placeholders = jobIds.map(() => '?').join(',');
  const row =
    SqliteConnection.query(
      `SELECT
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeCount,
          AVG(price) AS avgPrice
       FROM listings
       WHERE job_id IN (${placeholders})`,
      jobIds,
    )[0] || {};

  return {
    numberOfActiveListings: Number(row.activeCount || 0),
    avgPriceOfListings: row?.avgPrice == null ? 0 : Math.round(Number(row.avgPrice)),
  };
};

/**
 * Compute distribution of listings by provider for the given set of job IDs.
 * Returns data ready for the pie chart component with fields `type` and `value` (percentage).
 *
 * Example return:
 * [ { type: 'immoscout', value: 62 }, { type: 'immowelt', value: 38 } ]
 *
 * When no jobIds are provided or no listings exist, returns empty array.
 *
 * @param {string[]} jobIds
 * @returns {{ type: string, value: number }[]}
 */
export const getProviderDistributionForJobIds = (jobIds = []) => {
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return [];
  }

  const placeholders = jobIds.map(() => '?').join(',');
  const rows = SqliteConnection.query(
    `SELECT provider, COUNT(*) AS cnt
     FROM listings
     WHERE job_id IN (${placeholders})
     GROUP BY provider
     ORDER BY cnt DESC`,
    jobIds,
  );

  const total = rows.reduce((acc, r) => acc + Number(r.cnt || 0), 0);
  if (total === 0) return [];

  // Map counts to integer percentage values (0-100). Ensure sum is ~100 by rounding.
  const percentages = rows.map((r) => ({
    type: r.provider,
    value: Math.round((Number(r.cnt) / total) * 100),
  }));

  // Adjust rounding drift to keep sum at 100 (optional minor correction)
  const drift = 100 - percentages.reduce((s, p) => s + p.value, 0);
  if (drift !== 0 && percentages.length > 0) {
    // apply drift to the largest slice to keep UX simple
    let maxIdx = 0;
    for (let i = 1; i < percentages.length; i++) {
      if (percentages[i].value > percentages[maxIdx].value) maxIdx = i;
    }
    percentages[maxIdx].value = Math.max(0, percentages[maxIdx].value + drift);
  }

  return percentages;
};

/**
 * Return a list of listing that either are active or have an unknown status
 * to constantly check if they are still online
 *
 * @returns {string[]} Array of listings
 */
export const getActiveOrUnknownListings = () => {
  return SqliteConnection.query(
    `SELECT *
     FROM listings
     WHERE is_active is null
        OR is_active = 1
     ORDER BY provider`,
  );
};

/**
 * Deactivates listings by setting is_active = 0 for all matching IDs.
 *
 * @param {string[]} ids - Array of listing IDs to deactivate.
 * @returns {object[]} Result of the SQLite query execution.
 */
export const deactivateListings = (ids) => {
  const placeholders = ids.map(() => '?').join(',');
  return SqliteConnection.execute(
    `UPDATE listings
     SET is_active = 0
     WHERE id IN (${placeholders})`,
    ids,
  );
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
      `INSERT INTO listings (id, hash, provider, job_id, price, size, title, image_url, description, address,
                             link, created_at, is_active)
       VALUES (@id, @hash, @provider, @job_id, @price, @size, @title, @image_url, @description, @address, @link,
               @created_at, 1)
       ON CONFLICT(job_id, hash) DO NOTHING`,
    );

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
        link: item.link,
        created_at: Date.now(),
      };
      stmt.run(params);
    }
  });

  /**
   * Extract the first number from a string like "1'690 CHF", "CHF 1'500", or "70 m²".
   * Handles Swiss formatting (apostrophe as thousand separator) and European decimals (comma).
   * Returns null on invalid input.
   * @param {string|undefined|null} str
   * @returns {number|null}
   */
  function extractNumber(str) {
    if (!str) return null;
    // Remove apostrophe (Swiss thousand separator)
    let cleaned = str.replace(/'/g, '');
    // Replace comma with dot for decimal parsing (European style)
    cleaned = cleaned.replace(',', '.');
    // Extract first number sequence (handles "CHF 1500" or "1500 CHF")
    const match = cleaned.match(/[\d.]+/);
    if (!match) return null;
    const num = parseFloat(match[0]);
    return isNaN(num) ? null : num;
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

/**
 * Query listings with pagination, filtering and sorting.
 *
 * @param {Object} params
 * @param {number} [params.pageSize=50]
 * @param {number} [params.page=1]
 * @param {string} [params.freeTextFilter]
 * @param {object} [params.activityFilter]
 * @param {object} [params.jobNameFilter]
 * @param {object} [params.providerFilter]
 * @param {object} [params.watchListFilter]
 * @param {string|null} [params.sortField=null] - One of: 'created_at','price','size','provider','title'.
 * @param {('asc'|'desc')} [params.sortDir='asc']
 * @param {string} [params.userId] - Current user id used to scope listings (ignored for admins).
 * @param {boolean} [params.isAdmin=false] - When true, returns all listings.
 * @returns {{ totalNumber:number, page:number, result:Object[] }}
 */
export const queryListings = ({
  pageSize = 50,
  page = 1,
  activityFilter,
  jobNameFilter,
  jobIdFilter,
  providerFilter,
  watchListFilter,
  freeTextFilter,
  sortField = null,
  sortDir = 'asc',
  userId = null,
  isAdmin = false,
} = {}) => {
  // sanitize inputs
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(500, Math.floor(pageSize)) : 50;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const offset = (safePage - 1) * safePageSize;

  // build WHERE filter across common text columns
  const whereParts = [];
  const params = { limit: safePageSize, offset };
  // always provide userId param for watched-flag evaluation (null -> no matches)
  params.userId = userId || '__NO_USER__';
  // user scoping (non-admin only): restrict to listings whose job belongs to user
  if (!isAdmin) {
    // Include listings from jobs owned by the user or jobs shared with the user
    whereParts.push(
      `(j.user_id = @userId OR EXISTS (SELECT 1 FROM json_each(j.shared_with_user) AS sw WHERE sw.value = @userId))`,
    );
  }
  if (freeTextFilter && String(freeTextFilter).trim().length > 0) {
    params.filter = `%${String(freeTextFilter).trim()}%`;
    whereParts.push(`(title LIKE @filter OR address LIKE @filter OR provider LIKE @filter OR link LIKE @filter)`);
  }
  // activityFilter: when true -> only active listings (is_active = 1), false -> only inactive
  if (activityFilter === true) {
    whereParts.push('(is_active = 1)');
  } else if (activityFilter === false) {
    whereParts.push('(is_active = 0)');
  }
  // Prefer filtering by job id when provided (unambiguous and robust)
  if (jobIdFilter && String(jobIdFilter).trim().length > 0) {
    params.jobId = String(jobIdFilter).trim();
    whereParts.push('(l.job_id = @jobId)');
  } else if (jobNameFilter && String(jobNameFilter).trim().length > 0) {
    // Fallback to exact job name match
    params.jobName = String(jobNameFilter).trim();
    whereParts.push('(j.name = @jobName)');
  }
  // providerFilter: when provided as string (assumed provider name), filter listings where provider equals that name (exact match)
  if (providerFilter && String(providerFilter).trim().length > 0) {
    params.providerName = String(providerFilter).trim();
    whereParts.push('(provider = @providerName)');
  }
  // watchListFilter: when true -> only watched listings, false -> only unwatched
  if (watchListFilter === true) {
    whereParts.push('(wl.id IS NOT NULL)');
  } else if (watchListFilter === false) {
    whereParts.push('(wl.id IS NULL)');
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  const whereSqlWithAlias = whereSql
    .replace(/\btitle\b/g, 'l.title')
    .replace(/\bdescription\b/g, 'l.description')
    .replace(/\baddress\b/g, 'l.address')
    .replace(/\bprovider\b/g, 'l.provider')
    .replace(/\blink\b/g, 'l.link')
    .replace(/\bis_active\b/g, 'l.is_active')
    .replace(/\bj\.user_id\b/g, 'j.user_id')
    .replace(/\bj\.name\b/g, 'j.name')
    .replace(/\bwl\.id\b/g, 'wl.id');

  // whitelist sortable fields to avoid SQL injection
  const sortable = new Set(['created_at', 'price', 'size', 'provider', 'title', 'job_name', 'is_active', 'isWatched']);
  const safeSortField = sortField && sortable.has(sortField) ? sortField : null;
  const safeSortDir = String(sortDir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const orderSql = safeSortField ? `ORDER BY ${safeSortField} ${safeSortDir}` : 'ORDER BY created_at DESC';
  const orderSqlWithAlias = orderSql
    .replace(/\bcreated_at\b/g, 'l.created_at')
    .replace(/\bprice\b/g, 'l.price')
    .replace(/\bsize\b/g, 'l.size')
    .replace(/\bprovider\b/g, 'l.provider')
    .replace(/\btitle\b/g, 'l.title')
    .replace(/\bjob_name\b/g, 'j.name')
    // Sort by computed watch flag when requested
    .replace(/\bisWatched\b/g, 'CASE WHEN wl.id IS NOT NULL THEN 1 ELSE 0 END');

  // count total with same WHERE
  const countRow = SqliteConnection.query(
    `SELECT COUNT(1) as cnt
     FROM listings l
            LEFT JOIN jobs j ON j.id = l.job_id
            LEFT JOIN watch_list wl ON wl.listing_id = l.id AND wl.user_id = @userId
       ${whereSqlWithAlias}`,
    params,
  );
  const totalNumber = countRow?.[0]?.cnt ?? 0;

  // fetch page
  const rows = SqliteConnection.query(
    `SELECT l.*,
            j.name                                        AS job_name,
            CASE WHEN wl.id IS NOT NULL THEN 1 ELSE 0 END AS isWatched
     FROM listings l
            LEFT JOIN jobs j ON j.id = l.job_id
            LEFT JOIN watch_list wl ON wl.listing_id = l.id AND wl.user_id = @userId
       ${whereSqlWithAlias}
         ${orderSqlWithAlias}
     LIMIT @limit OFFSET @offset`,
    params,
  );

  return { totalNumber, page: safePage, result: rows };
};

/**
 * Delete all listings for a given job id.
 *
 * @param {string} jobId - The job identifier whose listings should be removed.
 * @returns {any} The result from SqliteConnection.execute (may contain changes count).
 */
export const deleteListingsByJobId = (jobId) => {
  if (!jobId) return;
  return SqliteConnection.execute(
    `DELETE
     FROM listings
     WHERE job_id = @jobId`,
    { jobId },
  );
};

/**
 * Delete listings by a list of listing IDs.
 *
 * @param {string[]} ids - Array of listing IDs to delete.
 * @returns {any} The result from SqliteConnection.execute.
 */
export const deleteListingsById = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  return SqliteConnection.execute(
    `DELETE
                                   FROM listings
                                   WHERE id IN (${placeholders})`,
    ids,
  );
};

/**
 * Return all listings with only the fields: title, address, and price.
 * This is the single helper requested for simple consumers.
 *
 * @returns {{title: string|null, address: string|null, price: number|null}[]}
 */
export const getAllEntriesFromListings = () => {
  return SqliteConnection.query(`SELECT title, address, price FROM listings`);
};
