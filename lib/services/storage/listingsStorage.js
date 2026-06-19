/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nullOrEmpty, fromJson } from '../../utils.js';
import SqliteConnection from './SqliteConnection.js';
import { nanoid } from 'nanoid';

/**
 * Parse the JSON `status` column of a listing row in place.
 *
 * The DB stores status as a JSON payload `{ status, setAt }` (or NULL).
 * Consumers expect an object/null, so we normalize before returning.
 *
 * @param {Object|null|undefined} row - A raw row from the listings table.
 * @returns {Object|null|undefined} The same row with `status` parsed.
 */
const parseListingStatus = (row) => {
  if (row == null) return row;
  if (typeof row.status === 'string') {
    row.status = fromJson(row.status, null);
  }
  return row;
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
     WHERE job_id = @jobId
       AND provider = @providerId`,
    { jobId, providerId },
  ).map((r) => r.hash);
};

/**
 * Compute KPI aggregates for a given set of job IDs from the listings table.
 *
 * - numberOfActiveListings: count of listings where is_active = 1
 * - medianPriceOfListings: median of numeric price, rounded to nearest integer
 *
 * When no jobIds are provided, returns zeros.
 *
 * @param {string[]} jobIds
 * @returns {{ numberOfActiveListings: number, medianPriceOfListings: number }}
 */
export const getListingsKpisForJobIds = (jobIds = []) => {
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return { numberOfActiveListings: 0, medianPriceOfListings: 0 };
  }

  const placeholders = jobIds.map(() => '?').join(',');
  const rows = SqliteConnection.query(
    `SELECT is_active, price
     FROM listings
     WHERE job_id IN (${placeholders})
       AND manually_deleted = 0`,
    jobIds,
  );

  const activeCount = rows.filter((r) => r.is_active === 1).length;

  const prices = rows
    .map((r) => r.price)
    .filter((p) => p !== null)
    .sort((a, b) => a - b);

  let medianPrice = 0;
  if (prices.length > 0) {
    const mid = Math.floor(prices.length / 2);
    medianPrice = prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  }

  return {
    numberOfActiveListings: activeCount,
    medianPriceOfListings: medianPrice,
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
       AND manually_deleted = 0
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
     WHERE (is_active is null OR is_active = 1)
       AND manually_deleted = 0
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
      `INSERT INTO listings (id, hash, provider, job_id, price, size, rooms, title, image_url, description, address,
                             link, created_at, is_active, latitude, longitude, currency)
       VALUES (@id, @hash, @provider, @job_id, @price, @size, @rooms, @title, @image_url, @description, @address, @link,
               @created_at, 1, @latitude, @longitude, @currency)
       ON CONFLICT(job_id, hash) DO NOTHING`,
    );

    for (const item of listings) {
      const params = {
        id: nanoid(),
        hash: item.id,
        provider: providerId,
        job_id: jobId,
        price: item.price,
        size: item.size,
        rooms: item.rooms,
        title: item.title,
        image_url: item.image,
        description: item.description,
        address: removeParentheses(item.address),
        link: item.link,
        created_at: Date.now(),
        latitude: item.latitude || null,
        longitude: item.longitude || null,
        currency: item.currency ?? null,
      };
      stmt.run(params);
      // Propagate the DB primary key back so downstream pipeline steps use the correct id
      item.id = params.id;
    }
  });

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
 * @param {('applied'|'rejected'|'accepted'|'none')} [params.statusFilter] - Filter by listing status. 'none' matches NULL.
 * @param {string|null} [params.sortField=null] - One of: 'created_at','price','size','provider','title'.
 * @param {('asc'|'desc')} [params.sortDir='asc']
 * @param {number} [params.createdAfter] - Only include listings created at or after this unix timestamp (ms).
 * @param {number} [params.createdBefore] - Only include listings created at or before this unix timestamp (ms).
 * @param {string} [params.userId] - Current user id used to scope listings (ignored for admins).
 * @param {boolean} [params.isAdmin=false] - When true, returns all listings.
 * @param {boolean} [params.hiddenOnly=false] - When true, returns only soft-deleted (manually_deleted = 1) listings.
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
  statusFilter,
  freeTextFilter,
  sortField = null,
  sortDir = 'asc',
  createdAfter = null,
  createdBefore = null,
  minPrice = null,
  maxPrice = null,
  userId = null,
  isAdmin = false,
  hiddenOnly = false,
} = {}) => {
  // sanitize inputs
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(1000, Math.floor(pageSize)) : 50;
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
    whereParts.push(
      `(l.title LIKE @filter OR l.address LIKE @filter OR l.provider LIKE @filter OR l.link LIKE @filter)`,
    );
  }
  // activityFilter: when true -> only active listings (is_active = 1), false -> only inactive
  if (activityFilter === true) {
    whereParts.push('(l.is_active = 1)');
  } else if (activityFilter === false) {
    whereParts.push('(l.is_active = 0)');
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
    whereParts.push('(l.provider = @providerName)');
  }
  // watchListFilter: when true -> only watched listings, false -> only unwatched
  if (watchListFilter === true) {
    whereParts.push('(wl.id IS NOT NULL)');
  } else if (watchListFilter === false) {
    whereParts.push('(wl.id IS NULL)');
  }
  // statusFilter: 'applied'|'rejected'|'accepted' -> equality on JSON status field; 'none' -> NULL.
  // The status column is a JSON payload `{ status, setAt }`, so we extract the inner
  // status string for comparison instead of matching the raw text.
  if (statusFilter === 'none') {
    whereParts.push('(l.status IS NULL)');
  } else if (
    typeof statusFilter === 'string' &&
    ['applied', 'rejected', 'accepted'].includes(statusFilter.toLowerCase())
  ) {
    params.statusValue = statusFilter.toLowerCase();
    whereParts.push(`(json_extract(l.status, '$.status') = @statusValue)`);
  }
  // Time range filters (unix timestamps in milliseconds)
  if (Number.isFinite(createdAfter) && createdAfter > 0) {
    params.createdAfter = createdAfter;
    whereParts.push('(l.created_at >= @createdAfter)');
  }
  if (Number.isFinite(createdBefore) && createdBefore > 0) {
    params.createdBefore = createdBefore;
    whereParts.push('(l.created_at <= @createdBefore)');
  }
  // Price range filters
  if (Number.isFinite(minPrice) && minPrice >= 0) {
    params.minPrice = minPrice;
    whereParts.push('(l.price >= @minPrice)');
  }
  if (Number.isFinite(maxPrice) && maxPrice >= 0) {
    params.maxPrice = maxPrice;
    whereParts.push('(l.price <= @maxPrice)');
  }

  // Build whereSql: in normal mode hide soft-deleted; in hiddenOnly mode show only soft-deleted.
  whereParts.push(hiddenOnly ? '(l.manually_deleted = 1)' : '(l.manually_deleted = 0)');

  const whereSqlWithAlias = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  // whitelist sortable fields to avoid SQL injection; map to fully-qualified expressions
  const sortableMap = {
    created_at: 'l.created_at',
    price: 'l.price',
    size: 'l.size',
    provider: 'l.provider',
    title: 'l.title',
    job_name: 'j.name',
    is_active: 'l.is_active',
    isWatched: 'CASE WHEN wl.id IS NOT NULL THEN 1 ELSE 0 END',
  };
  const safeSortExpr = sortField && sortableMap[sortField] ? sortableMap[sortField] : null;
  const safeSortDir = String(sortDir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const orderSqlWithAlias = safeSortExpr ? `ORDER BY ${safeSortExpr} ${safeSortDir}` : 'ORDER BY l.created_at DESC';

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

  return { totalNumber, page: safePage, result: rows.map(parseListingStatus) };
};

/**
 * Delete all listings for a given job id.
 *
 * @param {string} jobId - The job identifier whose listings should be removed.
 * @param {boolean} [hardDelete=false] - Whether to hard delete from DB or just mark as deleted.
 * @returns {any} The result from SqliteConnection.execute.
 */
export const deleteListingsByJobId = (jobId, hardDelete = false) => {
  if (!jobId) return;
  if (hardDelete) {
    return SqliteConnection.execute(
      `DELETE FROM listings
       WHERE job_id = @jobId`,
      { jobId },
    );
  }
  return SqliteConnection.execute(
    `UPDATE listings
     SET manually_deleted = 1
     WHERE job_id = @jobId`,
    { jobId },
  );
};

/**
 * Delete listings by a list of listing IDs (the nanoid primary key stored in the `id` column).
 * Used by API routes that receive row IDs from the client.
 *
 * @param {string[]} ids - Array of DB row IDs to delete.
 * @param {boolean} [hardDelete=false] - Whether to hard delete from DB or just mark as deleted.
 * @returns {any} The result from SqliteConnection.execute.
 */
export const deleteListingsById = (ids, hardDelete = false) => {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  if (hardDelete) {
    return SqliteConnection.execute(
      `DELETE FROM listings
       WHERE id IN (${placeholders})`,
      ids,
    );
  }
  return SqliteConnection.execute(
    `UPDATE listings
     SET manually_deleted = 1
     WHERE id IN (${placeholders})`,
    ids,
  );
};

/**
 * Restore previously soft-deleted listings by clearing their `manually_deleted` flag.
 *
 * @param {string[]} ids - Array of DB row IDs to restore.
 * @returns {any} The result from SqliteConnection.execute.
 */
export const restoreListingsById = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  return SqliteConnection.execute(
    `UPDATE listings
     SET manually_deleted = 0
     WHERE id IN (${placeholders})`,
    ids,
  );
};

/**
 * Return all listings that are active, have an address, and do not yet have geocoordinates.
 *
 * @returns {Object[]} Array of listing objects {id, address}.
 */
export const getListingsToGeocode = () => {
  return SqliteConnection.query(
    `SELECT id, address
     FROM listings
     WHERE is_active = 1
       AND manually_deleted = 0
       AND address IS NOT NULL
       AND (latitude IS NULL OR longitude IS NULL)`,
  );
};

/**
 * Update the geocoordinates for a listing.
 *
 * @param {string} id - The listing ID.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {void}
 */
export const updateListingGeocoordinates = (id, latitude, longitude) => {
  SqliteConnection.execute(
    `UPDATE listings
     SET latitude = @latitude,
         longitude = @longitude
     WHERE id = @id`,
    { id, latitude, longitude },
  );
};

/**
 * Return listings with geocoordinates for the map view, with optional filtering.
 *
 * @param {Object} params
 * @param {string} [params.jobId]
 * @param {string} [params.userId]
 * @param {boolean} [params.isAdmin=false]
 * @returns {{listings: Object[]}} Object containing listings.
 */
export const getListingsForMap = ({ jobId, userId = null, isAdmin = false } = {}) => {
  const baseWhereParts = [
    'l.latitude IS NOT NULL',
    'l.longitude IS NOT NULL',
    'l.latitude != -1',
    'l.longitude != -1',
    'l.is_active = 1',
    'l.manually_deleted = 0',
  ];
  const params = { userId: userId || '__NO_USER__' };

  if (!isAdmin) {
    baseWhereParts.push(
      `(j.user_id = @userId OR EXISTS (SELECT 1 FROM json_each(j.shared_with_user) AS sw WHERE sw.value = @userId))`,
    );
  }

  if (jobId) {
    params.jobId = jobId;
    baseWhereParts.push('l.job_id = @jobId');
  }

  const wherePartsForListings = [...baseWhereParts];

  const listings = SqliteConnection.query(
    `SELECT l.*, j.name AS job_name
     FROM listings l
     LEFT JOIN jobs j ON j.id = l.job_id
     WHERE ${wherePartsForListings.join(' AND ')}`,
    params,
  );

  return {
    listings,
  };
};

/**
 * Return all listings with only the fields: title, address, and price.
 * This is the single helper requested for simple consumers.
 *
 * @returns {{title: string|null, address: string|null, price: number|null}[]}
 */
export const getAllEntriesFromListings = () => {
  return SqliteConnection.query(
    `SELECT title, address, price, provider, job_id FROM listings WHERE manually_deleted = 0`,
  );
};

/**
 * Return geocoordinates for a given address if it has been geocoded before.
 *
 * @param {string} address
 * @returns {{lat: number, lng: number}|null}
 */
export const getGeocoordinatesByAddress = (address) => {
  const row = SqliteConnection.query(
    `SELECT latitude, longitude
     FROM listings
     WHERE address = @address
       AND manually_deleted = 0
       AND latitude IS NOT NULL
       AND longitude IS NOT NULL
       AND latitude != -1
       AND longitude != -1
     LIMIT 1`,
    { address },
  )[0];
  return row ? { lat: row.latitude, lng: row.longitude } : null;
};

/**
 * Return all active listings for a given job that have geocoordinates but no distance set.
 *
 * @param {string} jobId
 * @returns {Object[]}
 */
export const getListingsToCalculateDistance = (jobId) => {
  return SqliteConnection.query(
    `SELECT id, latitude, longitude
     FROM listings
     WHERE job_id = @jobId
       AND is_active = 1
       AND manually_deleted = 0
       AND latitude IS NOT NULL
       AND longitude IS NOT NULL
       AND distance_to_destination IS NULL`,
    { jobId },
  );
};

/**
 * Return all active listings for a given user (across all jobs) that have geocoordinates.
 *
 * @param {string} userId
 * @returns {Object[]}
 */
export const getListingsForUserToCalculateDistance = (userId) => {
  return SqliteConnection.query(
    `SELECT l.id, l.latitude, l.longitude
     FROM listings l
     JOIN jobs j ON l.job_id = j.id
     WHERE j.user_id = @userId
       AND l.is_active = 1
       AND l.manually_deleted = 0
       AND l.latitude IS NOT NULL
       AND l.longitude IS NOT NULL`,
    { userId },
  );
};

/**
 * Update the distance to destination for a listing.
 *
 * @param {string} id
 * @param {number} distance
 * @returns {void}
 */
export const updateListingDistance = (id, distance) => {
  SqliteConnection.execute(
    `UPDATE listings
     SET distance_to_destination = @distance
     WHERE id = @id`,
    { id, distance },
  );
};

/**
 * Return a single listing by id.
 *
 * @param {string} id
 * @param {string} userId
 * @param {boolean} isAdmin
 * @returns {Object|null}
 */
export const getListingById = (id, userId = null, isAdmin = false) => {
  const params = { id, userId: userId || '__NO_USER__' };
  let whereScoping = '';
  if (!isAdmin) {
    whereScoping = `AND (j.user_id = @userId OR EXISTS (SELECT 1 FROM json_each(j.shared_with_user) AS sw WHERE sw.value = @userId))`;
  }
  return parseListingStatus(
    SqliteConnection.query(
      `SELECT l.*, j.name AS job_name, CASE WHEN wl.id IS NOT NULL THEN 1 ELSE 0 END AS isWatched
     FROM listings l
     LEFT JOIN jobs j ON j.id = l.job_id
     LEFT JOIN watch_list wl ON wl.listing_id = l.id AND wl.user_id = @userId
     WHERE l.id = @id AND l.manually_deleted = 0 ${whereScoping}`,
      params,
    )[0] || null,
  );
};

/**
 * Set or clear the notes attached to a single listing.
 *
 * Empty strings are normalized to NULL so the DB doesn't keep meaningless
 * whitespace and queries can filter "has notes" with a simple IS NOT NULL.
 *
 * @param {string} id - The listing ID.
 * @param {string|null} notes - The note text to store, or null/empty to clear.
 * @returns {number} Number of rows affected (0 if listing not found).
 */
export const setListingNotes = (id, notes) => {
  if (!id) return 0;
  const trimmed = typeof notes === 'string' ? notes.trim() : null;
  const value = trimmed && trimmed.length > 0 ? trimmed : null;
  const res = SqliteConnection.execute(`UPDATE listings SET notes = @notes WHERE id = @id`, {
    id,
    notes: value,
  });
  return res?.changes ?? 0;
};

/**
 * Set or clear the status of a single listing.
 *
 * The status column stores a JSON payload `{ status, setAt }` so consumers
 * can show both the user's decision and when it was made. Passing `null`
 * clears the column.
 *
 * @param {string} id - The listing ID.
 * @param {('applied'|'rejected'|'accepted'|null)} status - New status, or null to clear.
 * @returns {number} Number of rows affected (0 if listing not found).
 */
export const setListingStatus = (id, status) => {
  if (!id) return 0;
  const allowed = ['applied', 'rejected', 'accepted'];
  const normalized = status == null ? null : String(status).toLowerCase();
  if (normalized != null && !allowed.includes(normalized)) {
    throw new Error(`Invalid listing status: ${status}`);
  }
  const payload = normalized == null ? null : JSON.stringify({ status: normalized, setAt: Date.now() });
  const res = SqliteConnection.execute(`UPDATE listings SET status = @status WHERE id = @id`, {
    id,
    status: payload,
  });
  return res?.changes ?? 0;
};

/**
 * Resets geocoordinates and distance for all listings related to a user.
 *
 * @param {string} userId
 * @returns {void}
 */
export const resetGeocoordinatesAndDistanceForUser = (userId) => {
  SqliteConnection.execute(
    `UPDATE listings
     SET latitude = NULL,
         longitude = NULL,
         distance_to_destination = NULL
     WHERE job_id IN (
       SELECT id FROM jobs j
       WHERE j.user_id = @userId
     )`,
    { userId },
  );
};

/**
 * Persist a translated description for a listing.
 *
 * Reads the existing `translations` JSON object for the listing, merges the new
 * language entry, and writes it back. Safe to call multiple times — subsequent
 * calls for the same language overwrite the previous value.
 *
 * @param {string} id - The listing ID (nanoid).
 * @param {string} language - Language code in lowercase, e.g. 'en' or 'de'.
 * @param {string} text - The translated description text.
 */
export const setListingTranslation = (id, language, text) => {
  const rows = SqliteConnection.query(`SELECT translations FROM listings WHERE id = ?`, [id]);
  const existing = rows[0]?.translations ? JSON.parse(rows[0].translations) : {};
  existing[language.toLowerCase()] = text;
  SqliteConnection.execute(`UPDATE listings SET translations = ? WHERE id = ?`, [JSON.stringify(existing), id]);
};
