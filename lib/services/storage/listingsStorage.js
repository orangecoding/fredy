/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nullOrEmpty, fromJson } from '../../utils.js';
import SqliteConnection from './SqliteConnection.js';
import { removeEntry } from '../similarity-check/similarityCache.js';
import { nanoid } from 'nanoid';
import { DEAL_TYPES } from '../dealType.js';

/**
 * How many ids go into a single `IN (...)` list.
 *
 * SQLite refuses a statement with more bound parameters than SQLITE_MAX_VARIABLE_NUMBER (32766 in
 * the build better-sqlite3 ships). Callers here pass unbounded id lists - the nightly alive-checker
 * hands over every listing that went offline - so every such query is chunked. 500 keeps the
 * statement small enough to be reused from the prepared-statement cache while still doing the work
 * in few round trips.
 * @type {number}
 */
const ID_CHUNK_SIZE = 500;

/**
 * SQL predicate granting access to a job owned by or shared with the current user.
 *
 * Keeping the rule separate from the query shape lets broad listing queries resolve the accessible
 * job set once, while point queries inspect only the job belonging to the one selected listing.
 *
 * @param {string} alias - Trusted SQL alias supplied by this module.
 * @returns {string}
 */
const jobAccessSql = (alias) => `(${alias}.user_id = @userId OR EXISTS (
  SELECT 1
  FROM json_each(${alias}.shared_with_user) AS scoped_user
  WHERE scoped_user.value = @userId
))`;

/**
 * Scope broad listing queries through the small jobs table before touching listings.
 *
 * Expressing this as a predicate on the joined job made SQLite scan the entire listings table and
 * run `json_each` once per listing. The subquery is evaluated per job instead, after which SQLite
 * can seek listings through the existing `(job_id, hash)` index.
 * @type {string}
 */
const USER_LISTING_SET_SCOPE_SQL = `l.job_id IN (
  SELECT scoped_job.id
  FROM jobs scoped_job
  WHERE ${jobAccessSql('scoped_job')}
)`;

/**
 * Scope a point lookup through only the job belonging to its selected listing.
 * @type {string}
 */
const USER_LISTING_POINT_SCOPE_SQL = `EXISTS (
  SELECT 1
  FROM jobs scoped_job
  WHERE scoped_job.id = l.job_id
    AND ${jobAccessSql('scoped_job')}
)`;

/**
 * Run `fn` over `ids` in {@link ID_CHUNK_SIZE}-sized slices inside one transaction.
 *
 * The transaction makes the chunking invisible to readers: either every id is processed or none is,
 * which matters because the callers are deletes and restores that used to be single statements.
 *
 * @param {string[]} ids
 * @param {(chunk: string[], db: import('better-sqlite3').Database) => void} fn
 * @returns {{changes: number}|undefined} Summed row count, or undefined for an empty input.
 */
function forEachIdChunk(ids, fn) {
  if (!Array.isArray(ids) || ids.length === 0) return undefined;
  let changes = 0;
  SqliteConnection.withTransaction((db) => {
    for (let offset = 0; offset < ids.length; offset += ID_CHUNK_SIZE) {
      const result = fn(ids.slice(offset, offset + ID_CHUNK_SIZE), db);
      changes += result?.changes ?? 0;
    }
  });
  return { changes };
}

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
  if (typeof row.distances === 'string') {
    row.distances = fromJson(row.distances, null);
  }
  if (typeof row.connectivity === 'string') {
    row.connectivity = fromJson(row.connectivity, null);
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
/**
 * How many listings each of the last `days` days brought in, for the given jobs.
 *
 * The dashboard otherwise only shows standing totals, which say nothing about whether the search
 * is still finding anything. Days with no findings are returned as zeroes rather than omitted, so
 * the caller can plot a continuous line without reconstructing the calendar.
 *
 * Buckets are cut in local time, because "today" on a dashboard means the user's today, and
 * `created_at` is epoch milliseconds.
 *
 * @param {string[]} jobIds
 * @param {number} [days=14] How many days to report, including today.
 * @param {number} [now=Date.now()] Injectable for tests.
 * @returns {Array<{date: string, count: number}>} Oldest first, `date` as YYYY-MM-DD.
 */
export const getListingsPerDayForJobIds = (jobIds = [], days = 14, now = Date.now()) => {
  const span = Number.isFinite(days) && days > 0 ? Math.floor(days) : 14;

  // The empty calendar is built first so a job with no findings still yields a full series.
  const buckets = new Map();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  for (let offset = span - 1; offset >= 0; offset--) {
    const day = new Date(startOfToday);
    day.setDate(day.getDate() - offset);
    buckets.set(toDayKey(day), 0);
  }

  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return [...buckets].map(([date, count]) => ({ date, count }));
  }

  const from = new Date(startOfToday);
  from.setDate(from.getDate() - (span - 1));

  const placeholders = jobIds.map(() => '?').join(',');
  const rows = SqliteConnection.query(
    `SELECT created_at
     FROM listings
     WHERE job_id IN (${placeholders})
       AND manually_deleted = 0
       AND created_at >= ?`,
    [...jobIds, from.getTime()],
  );

  for (const row of rows) {
    const key = toDayKey(new Date(Number(row.created_at)));
    // A row can still fall outside the window if created_at is in the future; ignore rather
    // than inventing a bucket for it.
    if (buckets.has(key)) {
      buckets.set(key, buckets.get(key) + 1);
    }
  }

  return [...buckets].map(([date, count]) => ({ date, count }));
};

/**
 * Local-time YYYY-MM-DD key for a date.
 *
 * @param {Date} date
 * @returns {string}
 */
function toDayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Active-listing count and median price for a set of jobs.
 *
 * Both numbers are computed in SQL. This is the dashboard's landing query, so it used to pull
 * every listing row of every accessible job into JS and sort them there just to produce two
 * scalars. SQLite has no median(), but offsetting into an ordered result is exact and can be
 * served straight from an index.
 *
 * @param {string[]} jobIds
 * @returns {{ numberOfActiveListings: number, medianPriceOfListings: number }}
 */
export const getListingsKpisForJobIds = (jobIds = []) => {
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return { numberOfActiveListings: 0, medianPriceOfListings: 0 };
  }

  const placeholders = jobIds.map(() => '?').join(',');
  const from = `FROM listings WHERE job_id IN (${placeholders}) AND manually_deleted = 0`;

  const counts = SqliteConnection.query(
    `SELECT SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeCount,
            COUNT(price)                                   AS pricedCount
     ${from}`,
    jobIds,
  )[0];

  const activeCount = Number(counts?.activeCount ?? 0);
  const pricedCount = Number(counts?.pricedCount ?? 0);

  let medianPrice = 0;
  if (pricedCount > 0) {
    // Even counts average the two middle rows, odd counts take the single middle one - the same
    // definition the JS implementation used.
    const isEven = pricedCount % 2 === 0;
    const offset = Math.floor((pricedCount - 1) / 2);
    const limit = isEven ? 2 : 1;
    const middle = SqliteConnection.query(
      `SELECT price ${from} AND price IS NOT NULL ORDER BY price LIMIT ${limit} OFFSET ${offset}`,
      jobIds,
    );
    if (middle.length > 0) {
      medianPrice = middle.reduce((sum, row) => sum + Number(row.price), 0) / middle.length;
    }
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
 * Return the distinct provider identifiers that currently have non-deleted listings
 * within the user's accessible scope (optionally filtered by a specific job).
 *
 * @param {Object} [params]
 * @param {string|null} [params.jobId]
 * @param {string|null} [params.jobName]
 * @param {string|null} [params.userId]
 * @param {boolean} [params.isAdmin]
 * @param {boolean} [params.hiddenOnly]
 * @returns {string[]}
 */
export const getAvailableProviders = ({
  jobId = null,
  jobName = null,
  userId = null,
  isAdmin = false,
  hiddenOnly = false,
} = {}) => {
  const whereParts = [];
  const params = { userId: userId || '__NO_USER__' };

  if (!isAdmin) {
    whereParts.push(USER_LISTING_SET_SCOPE_SQL);
  }
  if (jobId && String(jobId).trim().length > 0) {
    params.jobId = String(jobId).trim();
    whereParts.push('(l.job_id = @jobId)');
  } else if (jobName && String(jobName).trim().length > 0) {
    params.jobName = String(jobName).trim();
    whereParts.push('(j.name = @jobName)');
  }
  if (hiddenOnly) {
    whereParts.push('(l.manually_deleted = 1)');
  } else {
    whereParts.push('(l.manually_deleted = 0)');
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  const rows = SqliteConnection.query(
    `SELECT DISTINCT l.provider
     FROM listings l
            LEFT JOIN jobs j ON j.id = l.job_id
     ${whereSql}
     ORDER BY l.provider ASC`,
    params,
  );

  return rows.map((r) => r.provider).filter(Boolean);
};

/**
 * Consecutive failed probes after which a listing counts as gone.
 *
 * A probe that errors (IP block, dropped connection, portal briefly unreachable) gives no verdict at
 * all, so such a listing would stay active forever. Ten failures in a row is the point at which
 * "the portal keeps refusing to answer" stops being a transient fault. A single definitive answer -
 * online or gone - resets the streak.
 * @type {number}
 */
export const ACTIVE_CHECK_FAILURE_LIMIT = 10;

/**
 * Re-probe window for a listing with a running failure streak (24 hours).
 *
 * Much shorter than the regular staleness window: at seven days a listing would need over two
 * months to reach {@link ACTIVE_CHECK_FAILURE_LIMIT}. The traffic stays bounded because the counter
 * caps the retries - after the limit the listing is deactivated and leaves the probe pool.
 * @type {number}
 */
export const ACTIVE_CHECK_FAILURE_RETRY_MS = 24 * 60 * 60 * 1000;

/**
 * Listings due for an "is this still online?" probe.
 *
 * Each row here costs one outbound HTTP request, so the set is bounded twice: only listings that
 * have not been checked within `staleAfterMs` are due, and at most `limit` of them per run. Never
 * checked (`last_checked_at IS NULL`) sorts first, then the least recently checked, so nothing is
 * starved. Previously this returned every active listing on every nightly run, which on a
 * long-lived instance meant hours of continuous requests at a handful of hosts.
 *
 * A listing whose last probes failed is due again after the much shorter `failureRetryMs` instead,
 * so it reaches {@link ACTIVE_CHECK_FAILURE_LIMIT} in days rather than months. Listings that already
 * reached the limit are excluded: the checker deactivates them, which takes them out of this query.
 *
 * Rows a human marked as available via {@link reactivateListings} are excluded outright. The probe
 * is what got them wrong in the first place, so letting it run again would just undo the correction
 * on the next nightly sweep.
 *
 * Only the columns the checker needs are selected; it used to pull `*`, including the description.
 *
 * @param {Object} [params]
 * @param {number} [params.limit=500] Maximum listings to return.
 * @param {number} [params.staleAfterMs=604800000] Re-check listings older than this (default 7 days).
 * @param {number} [params.failureRetryMs=86400000] Re-check window for listings with a failure streak.
 * @param {number} [params.now=Date.now()] Injectable for tests.
 * @returns {Array<{id: string, link: string, provider: string}>}
 */
export const getListingsDueForActiveCheck = ({
  limit = 500,
  staleAfterMs = 7 * 24 * 60 * 60 * 1000,
  failureRetryMs = ACTIVE_CHECK_FAILURE_RETRY_MS,
  now = Date.now(),
} = {}) => {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 500;
  return SqliteConnection.query(
    `SELECT id, link, provider
     FROM listings
     WHERE (is_active IS NULL OR is_active = 1)
       AND manually_deleted = 0
       AND activity_is_manual = 0
       AND (
         last_checked_at IS NULL
         OR (COALESCE(active_check_failures, 0) = 0 AND last_checked_at <= @staleBefore)
         OR (COALESCE(active_check_failures, 0) BETWEEN 1 AND @maxFailures AND last_checked_at <= @failureRetryBefore)
       )
     ORDER BY last_checked_at IS NOT NULL, last_checked_at
     LIMIT ${safeLimit}`,
    {
      staleBefore: now - staleAfterMs,
      failureRetryBefore: now - failureRetryMs,
      maxFailures: ACTIVE_CHECK_FAILURE_LIMIT - 1,
    },
  );
};

/**
 * Record that these listings were probed and got a definitive answer.
 *
 * Called for every listing the probe answered for - online as well as gone - otherwise the same
 * listings would come back as due on every single run. A definitive answer also clears the failure
 * streak: whatever blocked the previous probes is evidently over.
 *
 * Failed probes go through {@link recordActiveCheckFailures} instead, which must not reset the
 * counter.
 *
 * @param {string[]} ids
 * @param {number} [checkedAt=Date.now()]
 * @returns {{changes: number}|undefined}
 */
export const markListingsChecked = (ids, checkedAt = Date.now()) => {
  return forEachIdChunk(ids, (chunk, db) =>
    db
      .prepare(
        `UPDATE listings
         SET last_checked_at = ?, active_check_failures = 0
         WHERE id IN (${chunk.map(() => '?').join(',')})`,
      )
      .run([checkedAt, ...chunk]),
  );
};

/**
 * Count one more failed probe for each listing and report which ones have now had enough.
 *
 * The increment and the read happen in one statement (`RETURNING`) so the caller cannot act on a
 * count that another run has meanwhile moved. The returned ids are the listings whose streak reached
 * `failureLimit`; the caller deactivates them, which both starts their retention period and takes
 * them out of the probe pool.
 *
 * `last_checked_at` is set here as well - a listing whose provider is unreachable must not come back
 * as due on every single run.
 *
 * @param {string[]} ids
 * @param {Object} [options]
 * @param {number} [options.checkedAt=Date.now()]
 * @param {number} [options.failureLimit=ACTIVE_CHECK_FAILURE_LIMIT]
 * @returns {string[]} Ids whose failure streak reached the limit.
 */
export const recordActiveCheckFailures = (
  ids,
  { checkedAt = Date.now(), failureLimit = ACTIVE_CHECK_FAILURE_LIMIT } = {},
) => {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  /** @type {string[]} */
  const exhausted = [];
  SqliteConnection.withTransaction((db) => {
    for (let offset = 0; offset < ids.length; offset += ID_CHUNK_SIZE) {
      const chunk = ids.slice(offset, offset + ID_CHUNK_SIZE);
      const rows = db
        .prepare(
          `UPDATE listings
           SET active_check_failures = COALESCE(active_check_failures, 0) + 1, last_checked_at = ?
           WHERE id IN (${chunk.map(() => '?').join(',')})
           RETURNING id, active_check_failures`,
        )
        .all([checkedAt, ...chunk]);
      for (const row of rows) {
        if (row.active_check_failures >= failureLimit) exhausted.push(row.id);
      }
    }
  });
  return exhausted;
};

/**
 * Deactivates listings by setting is_active = 0 for all matching IDs.
 *
 * Also stamps `inactive_since`, which starts the retention period after which
 * {@link purgeExpiredInactiveListings} hard deletes the row. `COALESCE` keeps the first such
 * timestamp, so re-deactivating a listing does not hand it another grace period.
 *
 * Nothing automated sets `is_active` back to 1 - a re-discovered listing conflicts on
 * (job_id, hash) and is left alone. The one path that does is {@link reactivateListings}, driven by
 * a human, and it clears `inactive_since` again.
 *
 * @param {string[]} ids - Array of listing IDs to deactivate.
 * @param {number} [inactiveSince=Date.now()] - When the listing was found to be gone.
 * @returns {{changes: number}|undefined} Result of the SQLite query execution.
 */
export const deactivateListings = (ids, inactiveSince = Date.now()) => {
  return forEachIdChunk(ids, (chunk, db) =>
    db
      .prepare(
        `UPDATE listings
         SET is_active = 0,
             inactive_since = COALESCE(inactive_since, ?),
             active_check_failures = 0
         WHERE id IN (${chunk.map(() => '?').join(',')})`,
      )
      .run([inactiveSince, ...chunk]),
  );
};

/**
 * Mark listings as available again because a human said so.
 *
 * The counterpart to {@link deactivateListings}, and the only thing in Fredy that sets `is_active`
 * back to 1. It exists because the alive-checker is a guess: a portal that answers 403 to anything
 * without a browser, a listing that briefly 404s mid-edit, or a flat that is still advertised on a
 * second portal the similarity check deduped away all end up marked as gone while the user is
 * looking straight at the live ad.
 *
 * Four columns move together, and all four are needed:
 * - `is_active = 1` puts the row back in the default list, on the map and in the KPIs.
 * - `inactive_since = NULL` stops {@link purgeExpiredInactiveListings} from hard deleting it once
 *   the retention period is up. Without this the row would silently vanish days later.
 * - `active_check_failures = 0` drops any failure streak the probe had built up.
 * - `activity_is_manual = 1` takes the row out of {@link getListingsDueForActiveCheck} for good, so
 *   the same probe that got it wrong cannot quietly undo the correction on the next nightly sweep.
 *
 * Rows the user soft-deleted are skipped: undeleting is what `/restore` is for, and reactivating
 * should not drag a listing back out of the hidden view as a side effect.
 *
 * @param {string[]} ids - Array of listing IDs to mark as available again.
 * @returns {{changes: number}|undefined} Result of the SQLite query execution.
 */
export const reactivateListings = (ids) => {
  return forEachIdChunk(ids, (chunk, db) =>
    db
      .prepare(
        `UPDATE listings
         SET is_active = 1,
             inactive_since = NULL,
             active_check_failures = 0,
             activity_is_manual = 1
         WHERE id IN (${chunk.map(() => '?').join(',')})
           AND manually_deleted = 0`,
      )
      .run(chunk),
  );
};

/**
 * Hard delete the listings that have been offline for longer than the retention period.
 *
 * The counterpart to the manual cleanup: without it, everything the alive-checker marked as gone
 * stays in the database forever. Deletion is irreversible, hence the two guards - a listing is only
 * touched once `retentionDays` have passed since `inactive_since`, and never if somebody has it on
 * their watch list. `is_active IS NULL` means "never determined" and is left alone, same as
 * {@link deleteInactiveListingsByJobId}.
 *
 * With `retentionDays = 7`, a listing whose `inactive_since` is seven full days old or older goes,
 * so it survives its seventh day and is deleted on the eighth.
 *
 * @param {Object} params
 * @param {number} params.retentionDays - Grace period in days. Values below 1 delete nothing.
 * @param {number} [params.now=Date.now()] - Injectable for tests.
 * @returns {{changes: number}} Number of deleted rows.
 */
export const purgeExpiredInactiveListings = ({ retentionDays, now = Date.now() }) => {
  if (!Number.isFinite(retentionDays) || retentionDays < 1) return { changes: 0 };
  const cutoff = now - Math.floor(retentionDays) * 24 * 60 * 60 * 1000;
  const where = `WHERE is_active = 0
       AND inactive_since IS NOT NULL
       AND inactive_since <= @cutoff
       AND id NOT IN (SELECT listing_id FROM watch_list)`;
  const result = hardDeleteAndEvict(
    `SELECT job_id, provider, title, address, price, size, rooms, manually_deleted
     FROM listings
     ${where}`,
    `DELETE FROM listings
     ${where}`,
    { cutoff },
  );
  return { changes: result?.changes ?? 0 };
};

/**
 * Default window after which a listing's price is looked at again (7 days).
 *
 * Deliberately the same order of magnitude as the alive-check window, but the two are independent
 * settings because a price probe is far more expensive than an alive probe and is the one an
 * operator will want to slow down first.
 * @type {number}
 */
export const PRICE_CHECK_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Listings due for a price probe.
 *
 * Every row here costs a rendered browser page, which is an order of magnitude more expensive than
 * the alive-checker's plain request, so the set is bounded the same way and more tightly: only
 * listings untouched for `staleAfterMs`, at most `limit` per run. Never probed
 * (`last_price_check_at IS NULL`) sorts first, then the least recently probed, so no listing is
 * starved.
 *
 * Inactive and manually deleted listings are excluded - there is no point paying for the price of
 * something that is gone, and a deleted listing is not shown anywhere the history could surface.
 *
 * The current `price` comes along because the caller has to diff against it, and fetching it here
 * saves a second read per listing.
 *
 * @param {Object} [params]
 * @param {number} [params.limit=100] Maximum listings to return.
 * @param {number} [params.staleAfterMs=PRICE_CHECK_STALE_MS] Re-probe listings older than this.
 * @param {number} [params.now=Date.now()] Injectable for tests.
 * @returns {Array<{id: string, link: string, provider: string, price: number|null, job_id: string}>}
 */
export const getListingsDueForPriceCheck = ({
  limit = 100,
  staleAfterMs = PRICE_CHECK_STALE_MS,
  now = Date.now(),
} = {}) => {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 100;
  return SqliteConnection.query(
    `SELECT id, link, provider, price, job_id
     FROM listings
     WHERE (is_active IS NULL OR is_active = 1)
       AND manually_deleted = 0
       AND link IS NOT NULL
       AND (last_price_check_at IS NULL OR last_price_check_at <= @staleBefore)
     ORDER BY last_price_check_at IS NOT NULL, last_price_check_at
     LIMIT ${safeLimit}`,
    { staleBefore: now - staleAfterMs },
  );
};

/**
 * Record that these listings had their price looked at.
 *
 * Written for every listing the probe attempted, including the ones where no price could be read.
 * A listing whose page cannot be parsed would otherwise stay permanently due and consume the whole
 * per-run budget on every run, starving every other listing forever.
 *
 * @param {string[]} ids
 * @param {number} [checkedAt=Date.now()]
 * @returns {{changes: number}|undefined}
 */
export const markListingsPriceChecked = (ids, checkedAt = Date.now()) => {
  return forEachIdChunk(ids, (chunk, db) =>
    db
      .prepare(
        `UPDATE listings
         SET last_price_check_at = ?
         WHERE id IN (${chunk.map(() => '?').join(',')})`,
      )
      .run([checkedAt, ...chunk]),
  );
};

/**
 * Append one price reading to a listing's history.
 *
 * Every reading is kept, including ones too small to be worth a notification: the notification
 * threshold is a question about what to interrupt the user with, not about what is true, and a
 * chart drawn from only the large moves would misrepresent the shape.
 *
 * @param {string} listingId
 * @param {number} price
 * @param {number} [observedAt=Date.now()]
 * @param {string|null} [source=null] Which lane produced this reading, for later diagnosis.
 * @returns {{changes: number}|undefined}
 */
export const recordPriceObservation = (listingId, price, observedAt = Date.now(), source = null) => {
  if (!listingId || !Number.isFinite(price)) return undefined;
  return SqliteConnection.execute(
    `INSERT INTO listing_price_history (id, listing_id, price, observed_at, source)
     VALUES (@id, @listingId, @price, @observedAt, @source)`,
    { id: nanoid(), listingId, price: Math.round(price), observedAt, source },
  );
};

/**
 * Move a listing to a new current price, keeping the one it had.
 *
 * `listings.price` stays the *current* price, which is what every existing consumer already assumes
 * - the min/max filters, the affordability band, the finance card. `previous_price` exists so the
 * overview can render a delta without touching the history table.
 *
 * @param {string} listingId
 * @param {number} newPrice
 * @param {number} [changedAt=Date.now()]
 * @returns {{changes: number}|undefined}
 */
export const applyPriceChange = (listingId, newPrice, changedAt = Date.now()) => {
  if (!listingId || !Number.isFinite(newPrice)) return undefined;
  return SqliteConnection.execute(
    `UPDATE listings
     SET previous_price = price,
         price = @newPrice,
         price_changed_at = @changedAt
     WHERE id = @listingId`,
    { listingId, newPrice: Math.round(newPrice), changedAt },
  );
};

/**
 * A listing's price readings, oldest first, for charting.
 *
 * @param {string} listingId
 * @param {Object} [options]
 * @param {number} [options.limit=200] Cap, so a long-lived listing cannot return an unbounded series.
 * @returns {Array<{price: number, observed_at: number, source: string|null}>}
 */
export const getPriceHistory = (listingId, { limit = 200 } = {}) => {
  if (!listingId) return [];
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 200;
  return SqliteConnection.query(
    `SELECT price, observed_at, source
     FROM listing_price_history
     WHERE listing_id = @listingId
     ORDER BY observed_at
     LIMIT ${safeLimit}`,
    { listingId },
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
    // RETURNING tells us whether the row was actually written. Without it a skipped insert still
    // overwrote item.id with the freshly generated nanoid, so every later step keyed on that id
    // (distance updates, the spec/area/similarity deletes) silently addressed a row that does not
    // exist. Happens whenever a hash repeats inside one batch, or two providers of the same job
    // find the same listing.
    const stmt = db.prepare(
      `INSERT INTO listings (id, hash, provider, job_id, price, size, rooms, build_year, energy_class, title,
                             image_url, description, address, link, created_at, is_active, latitude, longitude)
       VALUES (@id, @hash, @provider, @job_id, @price, @size, @rooms, @build_year, @energy_class, @title, @image_url,
               @description, @address, @link, @created_at, 1, @latitude, @longitude)
       ON CONFLICT(job_id, hash) DO NOTHING
       RETURNING id`,
    );
    const findExisting = db.prepare(`SELECT id FROM listings WHERE job_id = @job_id AND hash = @hash LIMIT 1`);

    for (const item of listings) {
      const params = {
        id: nanoid(),
        hash: item.id,
        provider: providerId,
        job_id: jobId,
        price: item.price,
        size: item.size,
        rooms: item.rooms,
        build_year: item.buildYear ?? null,
        energy_class: item.energyClass ?? null,
        title: item.title,
        image_url: item.image,
        description: item.description,
        address: removeParentheses(item.address),
        link: item.link,
        created_at: Date.now(),
        latitude: item.latitude || null,
        longitude: item.longitude || null,
      };
      const inserted = stmt.get(params);
      // Propagate the DB primary key back so downstream pipeline steps use the correct id. On a
      // conflict the existing row's id is the right one to carry forward.
      item.id = inserted?.id ?? findExisting.get({ job_id: jobId, hash: params.hash })?.id ?? params.id;
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
 * @param {{buy: import('../finance/listingFilter.js').AffordabilityWindow|null, rent: import('../finance/listingFilter.js').AffordabilityWindow|null}|null} [params.affordabilityBand=null] -
 *   Price windows for the affordability filter, one per deal type. Kept separate from minPrice/maxPrice so the
 *   two compose instead of overwriting each other. Each window is a plain price range because the monthly rate
 *   is monotonic in price, so an affordability verdict is decided by price alone - see
 *   lib/services/finance/affordability.js. Which window applies is decided by the job's deal type, since rent
 *   and purchase prices share the one `price` column at completely different magnitudes.
 * @param {{mode: ('transit'|'car'|'bike'|'walk'), maxMinutes: number, label?: string}|null} [params.travelTimeFilter=null] -
 *   Ceiling on the stored travel time. Without a label any configured address counts.
 * @param {number|null} [params.connectivityMinDown=null] - Smallest acceptable downstream in Mbit/s.
 * @param {boolean} [params.connectivityFiberOnly=false] - Only addresses served by fibre to the building or home.
 * @param {number|null} [params.connectivityMobileMask=null] - Bitmask from `mobileBits.js`; a listing matches when
 *   its stored mask has any of these bits set. The caller builds it, because which bit a technology and operator
 *   pair maps to is not something an HTTP request gets to decide.
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
  affordabilityBand = null,
  travelTimeFilter = null,
  connectivityMinDown = null,
  connectivityFiberOnly = false,
  connectivityMobileMask = null,
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
    whereParts.push(USER_LISTING_SET_SCOPE_SQL);
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
  // Affordability band. Deliberately uses its own parameter names so it ANDs with the
  // price range above rather than clobbering it. A listing without a price can never
  // carry a verdict, so NULL is excluded outright.
  //
  // The two windows are OR'ed and each is gated on the deal type of the job that found the
  // listing: a 1.200 EUR rent and a 1.200 EUR flat are not the same kind of number. A side that
  // came back null (that half of the profile is incomplete) contributes no arm at all, so those
  // listings drop out - there is no yardstick to judge them by.
  if (affordabilityBand != null) {
    const arms = [];
    for (const dealType of [DEAL_TYPES.BUY, DEAL_TYPES.RENT]) {
      const window = affordabilityBand[dealType];
      if (window == null) {
        continue;
      }
      // `null` means "no bound" and must not be coerced: Number(null) is 0, which would turn
      // the open-ended top band into `price <= 0` and silently match nothing.
      const bound = (value) => (value == null ? NaN : Number(value));
      const min = bound(window.min);
      const minExclusive = bound(window.minExclusive);
      const max = bound(window.max);
      const conditions = [`j.deal_type = @affDealType_${dealType}`, 'l.price IS NOT NULL'];
      params[`affDealType_${dealType}`] = dealType;
      if (Number.isFinite(min) && min >= 0) {
        params[`affMin_${dealType}`] = min;
        conditions.push(`l.price >= @affMin_${dealType}`);
      }
      // Strictly greater, because this bound is the ceiling of the band below. Rounding it up
      // to an inclusive bound would drop whichever price falls in between and leave a listing
      // with a verdict chip the filter cannot find.
      if (Number.isFinite(minExclusive) && minExclusive >= 0) {
        params[`affMinEx_${dealType}`] = minExclusive;
        conditions.push(`l.price > @affMinEx_${dealType}`);
      }
      if (Number.isFinite(max) && max >= 0) {
        params[`affMax_${dealType}`] = max;
        conditions.push(`l.price <= @affMax_${dealType}`);
      }
      arms.push(`(${conditions.join(' AND ')})`);
    }
    if (arms.length > 0) {
      whereParts.push(`(${arms.join(' OR ')})`);
    }
  }
  // Travel time ceiling, e.g. "no more than 30 minutes by public transport from Work".
  //
  // An EXISTS rather than a join: a listing has one row per address, and joining would return it
  // once per address that matches. The mode picks a column, so it goes through a whitelist and is
  // never interpolated from the request - the same rule the sortable fields below follow.
  //
  // A listing whose travel times have not been computed yet has no row and therefore drops out.
  // That is the honest answer: the filter can only speak about journeys it knows.
  if (travelTimeFilter != null) {
    const modeColumns = {
      transit: 'transit_minutes',
      car: 'car_minutes',
      bike: 'bike_minutes',
      walk: 'walk_minutes',
    };
    const column = modeColumns[String(travelTimeFilter.mode ?? '').toLowerCase()];
    const maxMinutes = Number(travelTimeFilter.maxMinutes);
    if (column && Number.isFinite(maxMinutes) && maxMinutes > 0) {
      params.travelTimeMax = Math.floor(maxMinutes);
      const conditions = [`tt.listing_id = l.id`, `tt.${column} IS NOT NULL`, `tt.${column} <= @travelTimeMax`];
      // Without a label the filter asks "any of my addresses", which is what somebody comparing
      // flats for one commute means when they have only configured one.
      if (typeof travelTimeFilter.label === 'string' && travelTimeFilter.label.trim().length > 0) {
        params.travelTimeLabel = travelTimeFilter.label.trim();
        conditions.push('tt.label = @travelTimeLabel');
      }
      whereParts.push(`EXISTS (SELECT 1 FROM listing_travel_times tt WHERE ${conditions.join(' AND ')})`);
    }
  }

  // Connectivity. All three read the flat columns the enrichment writes alongside its JSON, which
  // is the whole reason those columns exist - see migration 36.
  //
  // A listing that has not been enriched yet, or whose country no register covers, has NULL here
  // and drops out of all three. That is the same answer the travel time filter gives for a listing
  // it has never measured: the filter can only speak about what it knows.
  if (Number.isFinite(connectivityMinDown) && connectivityMinDown > 0) {
    params.connectivityMinDown = Math.floor(connectivityMinDown);
    whereParts.push('(l.connectivity_max_down >= @connectivityMinDown)');
  }
  if (connectivityFiberOnly === true) {
    whereParts.push('(l.connectivity_fiber = 1)');
  }
  if (Number.isFinite(connectivityMobileMask) && connectivityMobileMask > 0) {
    params.connectivityMobileMask = connectivityMobileMask;
    whereParts.push('((l.connectivity_mobile & @connectivityMobileMask) != 0)');
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
            j.deal_type                                   AS dealType,
            CASE WHEN wl.id IS NOT NULL THEN 1 ELSE 0 END AS isWatched
     FROM listings l
            LEFT JOIN jobs j ON j.id = l.job_id
            LEFT JOIN watch_list wl ON wl.listing_id = l.id AND wl.user_id = @userId
       ${whereSqlWithAlias}
         ${orderSqlWithAlias}
     LIMIT @limit OFFSET @offset`,
    params,
  );

  return { totalNumber, page: safePage, result: attachTravelTimes(rows.map(parseListingStatus)) };
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
    return hardDeleteAndEvict(
      `SELECT job_id, provider, title, address, price, size, rooms, manually_deleted
       FROM listings
       WHERE job_id = @jobId`,
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
 * Hard delete the listings of a job that the alive-checker has marked as gone.
 *
 * Used by the nightly demo cleanup to keep the demo database from growing without bound.
 * Listings whose activity was never determined (`is_active IS NULL`) are kept - unknown is not
 * the same as gone.
 *
 * @param {string} jobId - The job whose dead listings should be removed.
 * @returns {any} The result from SqliteConnection.execute, or undefined without a job id.
 */
export const deleteInactiveListingsByJobId = (jobId) => {
  if (!jobId) return;
  return hardDeleteAndEvict(
    `SELECT job_id, provider, title, address, price, size, rooms, manually_deleted
     FROM listings
     WHERE job_id = @jobId AND is_active = 0`,
    `DELETE FROM listings
     WHERE job_id = @jobId AND is_active = 0`,
    { jobId },
  );
};

/**
 * Hard delete listings and evict their content from the in-memory similarity
 * cache so future scans don't immediately soft-delete re-discovered copies.
 *
 * The affected rows are read first (the DELETE removes them irrecoverably),
 * then deleted, then each is evicted from the cache. See
 * {@link module:similarityCache.removeEntry} for why eviction is required.
 *
 * @param {string} selectSql - Query selecting the similarity fields and deletion status of the rows to delete.
 * @param {string} deleteSql - The DELETE statement removing the same rows.
 * @param {Object|Array} params - Bind parameters shared by both statements.
 * @returns {any} The result from SqliteConnection.execute for the DELETE.
 */
function hardDeleteAndEvict(selectSql, deleteSql, params) {
  const removed = SqliteConnection.query(selectSql, params);
  const result = SqliteConnection.execute(deleteSql, params);
  removed
    .filter((row) => !row.manually_deleted)
    .forEach((row) =>
      removeEntry({
        jobId: row.job_id,
        provider: row.provider,
        title: row.title,
        address: row.address,
        price: row.price,
        size: row.size,
        rooms: row.rooms,
      }),
    );
  return result;
}

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
  if (hardDelete) {
    let changes = 0;
    for (let offset = 0; offset < ids.length; offset += ID_CHUNK_SIZE) {
      const chunk = ids.slice(offset, offset + ID_CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      const result = hardDeleteAndEvict(
        `SELECT job_id, provider, title, address, price, size, rooms, manually_deleted
         FROM listings
         WHERE id IN (${placeholders})`,
        `DELETE FROM listings
         WHERE id IN (${placeholders})`,
        chunk,
      );
      changes += result?.changes ?? 0;
    }
    return { changes };
  }
  return forEachIdChunk(ids, (chunk, db) =>
    db
      .prepare(
        `UPDATE listings
         SET manually_deleted = 1
         WHERE id IN (${chunk.map(() => '?').join(',')})`,
      )
      .run(chunk),
  );
};

/**
 * Restore previously soft-deleted listings by clearing their `manually_deleted` flag.
 *
 * @param {string[]} ids - Array of DB row IDs to restore.
 * @returns {any} The result from SqliteConnection.execute.
 */
export const restoreListingsById = (ids) => {
  return forEachIdChunk(ids, (chunk, db) =>
    db
      .prepare(
        `UPDATE listings
         SET manually_deleted = 0
         WHERE id IN (${chunk.map(() => '?').join(',')})`,
      )
      .run(chunk),
  );
};

/**
 * Return all listings that are active, have an address, and do not yet have geocoordinates.
 *
 * The `address_is_manual` clause is belt and braces rather than a fix: a manual address always
 * comes with coordinates, so such a row can never satisfy the NULL check above it. It is here so
 * the intent lives in the query, for whoever later relaxes what a manual address has to carry.
 *
 * The provider rides along because it is what says which countries the address may be in: a
 * listing found by a German portal is geocoded against Germany, one found by a portal covering
 * somewhere else against that.
 *
 * @returns {Object[]} Array of listing objects {id, address, provider}.
 */
export const getListingsToGeocode = () => {
  return SqliteConnection.query(
    `SELECT id, address, provider
     FROM listings
     WHERE is_active = 1
       AND manually_deleted = 0
       AND address IS NOT NULL
       AND address_is_manual = 0
       AND (latitude IS NULL OR longitude IS NULL)`,
  );
};

/**
 * Listings whose connectivity still has to be looked up.
 *
 * Two kinds come back: the ones never asked about, which on an instance that upgrades into this
 * feature is its whole back catalogue, and the ones whose answer has aged past the point where the
 * registers behind it will have been refreshed.
 *
 * Only listings that already have coordinates, because the lookup is by place, not by address
 * text. The geocoding sweep runs first in the same task, so a listing found in this run is
 * normally enriched in the same run too.
 *
 * @param {Object} params
 * @param {number} params.limit - Ceiling on how many listings one sweep works through.
 * @param {number} params.maxAgeDays - Age at which a stored answer is looked up again.
 * @param {number} [params.now=Date.now()]
 * @returns {Object[]} Array of {id, latitude, longitude, provider}.
 */
export const getListingsToEnrichConnectivity = ({ limit, maxAgeDays, now = Date.now() }) => {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 200;
  const staleBefore = now - Math.max(1, Number(maxAgeDays) || 1) * 24 * 60 * 60 * 1000;

  return SqliteConnection.query(
    `SELECT id, latitude, longitude, provider
     FROM listings
     WHERE is_active = 1
       AND manually_deleted = 0
       AND latitude IS NOT NULL
       AND longitude IS NOT NULL
       AND latitude != -1
       AND longitude != -1
       AND (connectivity_at IS NULL OR connectivity_at < @staleBefore)
     ORDER BY connectivity_at IS NOT NULL, created_at DESC
     LIMIT @safeLimit`,
    { staleBefore, safeLimit },
  );
};

/**
 * Store the result of a connectivity lookup.
 *
 * Called for a failed lookup too, with a null payload. The timestamp is what stops a listing at an
 * address no register knows from being asked again on every sweep, so it is written either way -
 * the retry comes when the age check above lets it through.
 *
 * @param {string} id - The listing ID.
 * @param {import('../connectivity/normalize.js').Connectivity|null} connectivity
 * @param {{maxDown: number|null, fiber: number|null, mobile: number|null}} columns - The filterable
 * parts, from `toColumns` in the connectivity service.
 * @param {number} [checkedAt=Date.now()]
 * @returns {void}
 */
export const updateListingConnectivity = (id, connectivity, columns, checkedAt = Date.now()) => {
  SqliteConnection.execute(
    `UPDATE listings
     SET connectivity = @connectivity,
         connectivity_max_down = @maxDown,
         connectivity_fiber = @fiber,
         connectivity_mobile = @mobile,
         connectivity_at = @checkedAt
     WHERE id = @id`,
    {
      id,
      connectivity: connectivity == null ? null : JSON.stringify(connectivity),
      maxDown: columns.maxDown ?? null,
      fiber: columns.fiber ?? null,
      mobile: columns.mobile ?? null,
      checkedAt,
    },
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
    baseWhereParts.push(USER_LISTING_SET_SCOPE_SQL);
  }

  if (jobId) {
    params.jobId = jobId;
    baseWhereParts.push('l.job_id = @jobId');
  }

  const wherePartsForListings = [...baseWhereParts];

  // Only what a pin and its popup need. It used to select `l.*`, which ships every listing's full
  // description to the browser for a view that never renders one.
  const listings = SqliteConnection.query(
    `SELECT l.id,
            l.title,
            l.price,
            l.size,
            l.rooms,
            l.address,
            l.link,
            l.image_url,
            l.provider,
            l.latitude,
            l.longitude,
            l.job_id,
            j.name       AS job_name,
            j.deal_type  AS dealType
     FROM listings l
     LEFT JOIN jobs j ON j.id = l.job_id
     WHERE ${wherePartsForListings.join(' AND ')}`,
    params,
  );

  return {
    listings: attachTravelTimes(listings),
  };
};

/**
 * Return every stored listing with the fields the similarity cache hydrates from - the exact-match
 * trio plus what {@link module:listingFingerprint} needs to recognise the same flat on another
 * portal (provider, size, rooms, description).
 *
 * @returns {{job_id: string, provider: string|null, title: string|null, address: string|null, price: number|null, size: number|null, rooms: number|null, description: string|null}[]}
 */
export const getAllEntriesFromListings = () => {
  return SqliteConnection.query(
    `SELECT job_id, provider, title, address, price, size, rooms, description
     FROM listings
     WHERE manually_deleted = 0`,
  );
};

/**
 * Return geocoordinates for a given address if it has been geocoded before.
 *
 * The match is on the address text, which is only as unique as the countries in play. While every
 * provider was German that was safe; a Swiss or Austrian provider brings street names spelled
 * exactly like German ones, and the first row to be geocoded would answer for both. `providerIds`
 * narrows the lookup to the providers of the countries actually being asked about. Omitting it
 * searches every provider, which is what the whole table amounted to before.
 *
 * @param {string} address
 * @param {string[]|null} [providerIds] - Providers whose listings may answer. Null or empty: any.
 * @returns {{lat: number, lng: number}|null}
 */
export const getGeocoordinatesByAddress = (address, providerIds = null) => {
  const scoped = Array.isArray(providerIds) && providerIds.length > 0;
  const providerClause = scoped ? `AND provider IN (${providerIds.map(() => '?').join(',')})` : '';
  const row = SqliteConnection.query(
    `SELECT latitude, longitude
     FROM listings
     WHERE address = ?
       AND manually_deleted = 0
       AND latitude IS NOT NULL
       AND longitude IS NOT NULL
       AND latitude != -1
       AND longitude != -1
       ${providerClause}
     LIMIT 1`,
    scoped ? [address, ...providerIds] : [address],
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
       AND distances IS NULL`,
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
 * How far through the travel-time backlog one user's listings are.
 *
 * Saving an address puts every listing back in front of the sweeper, and the sweeper is deliberately
 * a trickle - it runs every two hours and takes only `poiLookupsPerRun` listings at a time, because
 * the services behind it are run by volunteers. On a few hundred listings that is most of a day.
 *
 * Without this the wait is invisible: the form says "Saved" and then nothing on screen changes until
 * the next morning, which reads as the feature being broken rather than as it being polite. This is
 * what lets the settings page say which it is.
 *
 * Counts the same listings the sweeper will actually visit - active, not deleted, and geocoded -
 * so the denominator is a number that can genuinely be reached rather than one that never completes.
 *
 * @param {string} userId
 * @returns {{measured: number, total: number}}
 */
export const getTravelTimeProgress = (userId) => {
  const row = SqliteConnection.query(
    `SELECT count(*) AS total,
            sum(CASE WHEN l.travel_times_at IS NOT NULL THEN 1 ELSE 0 END) AS measured
     FROM listings l
     JOIN jobs j ON l.job_id = j.id
     WHERE j.user_id = @userId
       AND l.is_active = 1
       AND l.manually_deleted = 0
       AND l.latitude IS NOT NULL
       AND l.longitude IS NOT NULL`,
    { userId },
  )[0];
  return { measured: row?.measured ?? 0, total: row?.total ?? 0 };
};

/**
 * Update the per-address distances for a listing.
 *
 * @param {string} id
 * @param {Array<{label: string, meters: number}>} distances
 * @returns {void}
 */
export const updateListingDistances = (id, distances) => {
  SqliteConnection.execute(
    `UPDATE listings
     SET distances = @distances
     WHERE id = @id`,
    { id, distances: JSON.stringify(distances) },
  );
};

/**
 * How often a listing may come back unroutable before it stops being asked.
 *
 * Lower than {@link ACTIVE_CHECK_FAILURE_LIMIT} because the two failures mean different things: a
 * listing that cannot be opened may well be back tomorrow, whereas a pair of coordinates the router
 * refuses is usually wrong in a way that will not fix itself. Five attempts spread over five sweeps
 * is enough to ride out a bad import on the upstream side.
 * @type {number}
 */
export const TRAVEL_TIME_FAILURE_LIMIT = 5;

/**
 * Listings whose travel times need looking at.
 *
 * Every row here costs a routing request against a donated community service, so the set is kept as
 * small as the feature allows: only active, non-deleted, geocoded listings, only ones never looked
 * at or gone stale, never ones that have already proven unroutable, and never more than `limit` in
 * one run. Never computed sorts first so a newly added address does not wait behind a refresh.
 *
 * The owning user comes along because the addresses to route to are the job owner's, and fetching
 * them here saves a lookup per listing.
 *
 * @param {Object} [params]
 * @param {number} [params.limit=60] Maximum listings to return.
 * @param {number} [params.staleBefore=0] Re-examine listings last computed before this timestamp.
 * @param {number} [params.failureLimit=TRAVEL_TIME_FAILURE_LIMIT]
 * @returns {Array<{id: string, latitude: number, longitude: number, job_id: string, user_id: string}>}
 */
export const getListingsDueForTravelTimes = ({
  limit = 60,
  staleBefore = 0,
  failureLimit = TRAVEL_TIME_FAILURE_LIMIT,
} = {}) => {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 60;
  return SqliteConnection.query(
    `SELECT l.id, l.latitude, l.longitude, l.job_id, j.user_id
     FROM listings l
     JOIN jobs j ON j.id = l.job_id
     WHERE l.is_active = 1
       AND l.manually_deleted = 0
       AND l.latitude IS NOT NULL
       AND l.longitude IS NOT NULL
       -- -1/-1 is the "geocoder found nothing" marker, not a place. Routing to it burns requests
       -- and the row never leaves the queue, because there is no answer to store.
       AND l.latitude != -1
       AND l.longitude != -1
       AND (l.travel_times_at IS NULL OR l.travel_times_at <= @staleBefore)
       AND COALESCE(l.travel_times_failures, 0) < @failureLimit
     ORDER BY l.travel_times_at IS NOT NULL, l.travel_times_at, l.created_at DESC
     LIMIT ${safeLimit}`,
    { staleBefore, failureLimit },
  );
};

/**
 * The stored travel times of a set of listings, grouped by listing.
 *
 * Read separately rather than joined onto the listing query on purpose: a join would return one row
 * per address and multiply every listing in a page by the number of configured addresses, which the
 * overview would then have to fold back together.
 *
 * @param {string[]} ids
 * @returns {Map<string, Array<Object>>} Listing id to its rows. Listings without any are absent.
 */
export const getTravelTimesForListings = (ids) => {
  /** @type {Map<string, Array<Object>>} */
  const byListing = new Map();
  if (!Array.isArray(ids) || ids.length === 0) return byListing;

  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
  for (let offset = 0; offset < unique.length; offset += ID_CHUNK_SIZE) {
    const chunk = unique.slice(offset, offset + ID_CHUNK_SIZE);
    const rows = SqliteConnection.query(
      `SELECT *
       FROM listing_travel_times
       WHERE listing_id IN (${chunk.map(() => '?').join(',')})`,
      chunk,
    );
    for (const row of rows) {
      const existing = byListing.get(row.listing_id);
      if (existing) {
        existing.push(row);
      } else {
        byListing.set(row.listing_id, [row]);
      }
    }
  }
  return byListing;
};

/**
 * Turn one stored row into the shape the API and the UI speak.
 *
 * A mode that was never routable stays absent rather than becoming a zero: "no bus goes there" and
 * "the bus takes no time" must not be the same value.
 *
 * @param {Object} row
 * @param {boolean} includeGeometry - Whether to carry the drawable routes along.
 * @returns {Object}
 */
function toTravelTimeEntry(row, includeGeometry) {
  const entry = {
    label: row.label,
    // The mode this address is measured in, which is the one the card leads with. Without it a card
    // would have to guess - and the obvious guess, the fastest mode, changes the moment the detail
    // page fills in the driving time, so a listing found by its train commute would suddenly be
    // described by its car commute instead. Null for rows written before it was recorded.
    mode: row.estimate_mode ?? null,
    // Says whether this came from a reachability estimate or from a real journey plan. The UI marks
    // the difference rather than hiding it: an estimate is useful for comparing fifty listings and
    // is not the number to quote at a viewing.
    estimate: row.is_estimate !== 0,
    referenceTime: row.reference_time,
    computedAt: row.computed_at,
  };
  if (row.transit_minutes != null) {
    entry.transit = { minutes: row.transit_minutes, transfers: row.transit_transfers ?? 0 };
    // The legs travel even without geometry, because the popover lists the stops a journey calls at
    // and that is read rather than drawn. The polylines themselves are stripped: they are the bulk
    // of a leg, and only the detail map ever draws them.
    const legs = row.transit_legs ? fromJson(row.transit_legs, null) : null;
    if (Array.isArray(legs) && legs.length > 0) {
      entry.transit.legs = includeGeometry ? legs : legs.map(({ geometry: _geometry, ...leg }) => leg); // eslint-disable-line no-unused-vars
    }
  }
  if (row.car_minutes != null) {
    entry.car = { minutes: row.car_minutes, distanceMeters: row.car_distance_meters ?? null };
  }
  if (row.bike_minutes != null) {
    entry.bike = { minutes: row.bike_minutes };
  }
  if (row.walk_minutes != null) {
    entry.walk = { minutes: row.walk_minutes };
  }
  if (includeGeometry) {
    for (const [mode, column] of [
      ['car', 'car_geometry'],
      ['bike', 'bike_geometry'],
      ['walk', 'walk_geometry'],
    ]) {
      if (entry[mode] != null && row[column]) {
        entry[mode].geometry = row[column];
      }
    }
  }
  // Which place a place type actually resolved to. The label says "Groceries"; without this the
  // detail page could not say *which* supermarket that was, and the map would have nothing to draw
  // a line to - a named address supplies its own coordinates, a place type cannot.
  //
  // `-1` is the marker for "we looked and found nothing", so a row carrying it has no place to
  // report rather than one in the Atlantic.
  if (row.origin_ref != null && row.origin_lat !== -1) {
    entry.place = { name: row.origin_name ?? '', lat: row.origin_lat, lng: row.origin_lng, category: row.origin_ref };
  }
  // The stops an estimate was worked out from. Always sent, geometry or not: it is a handful of
  // bytes and it is what lets somebody check an estimate rather than take it on faith.
  if (row.via_stops) {
    const via = fromJson(row.via_stops, null);
    if (Array.isArray(via) && via.length > 0) {
      entry.via = via;
    }
  }
  return entry;
}

/**
 * Attach the stored travel times to listing rows, in place.
 *
 * The encoded driving route is only handed out for a single listing. It is a few hundred bytes per
 * address and only the detail map ever draws it, so shipping it with a page of fifty listings would
 * be paying for it fifty times over for nothing.
 *
 * @template {{id: string}} T
 * @param {T[]} rows
 * @param {Object} [options]
 * @param {boolean} [options.includeGeometry=false]
 * @returns {T[]} The same rows.
 */
export const attachTravelTimes = (rows, { includeGeometry = false } = {}) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const byListing = getTravelTimesForListings(rows.map((row) => row.id));
  for (const row of rows) {
    const stored = byListing.get(row.id);
    if (stored != null) {
      row.travelTimes = stored.map((entry) => toTravelTimeEntry(entry, includeGeometry));
    }
  }
  return rows;
};

/**
 * Replace a listing's travel times with the given set.
 *
 * One transaction, and deliberately a replacement rather than a merge: the entries are the complete
 * answer for the addresses the user has right now, so an address they removed has to disappear with
 * them. Carrying rows over unchanged is the caller's job - it is the caller that knows which pairs
 * were actually re-requested and which were only renamed.
 *
 * @param {string} listingId
 * @param {Array<Object>} entries - One per address label.
 * @param {number} [computedAt=Date.now()]
 * @returns {void}
 */
export const saveListingTravelTimes = (listingId, entries, computedAt = Date.now(), { stamp = true } = {}) => {
  if (!listingId) return;
  const rows = Array.isArray(entries) ? entries.filter((entry) => entry && typeof entry.label === 'string') : [];

  SqliteConnection.withTransaction((db) => {
    if (rows.length === 0) {
      db.prepare(`DELETE FROM listing_travel_times WHERE listing_id = @listingId`).run({ listingId });
    } else {
      const labels = rows.map((row) => row.label);
      db.prepare(
        `DELETE FROM listing_travel_times
         WHERE listing_id = ?
           AND label NOT IN (${labels.map(() => '?').join(',')})`,
      ).run([listingId, ...labels]);

      const upsert = db.prepare(
        `INSERT INTO listing_travel_times (listing_id, label, origin_lat, origin_lng, transit_minutes,
                                           transit_transfers, transit_legs, car_minutes, car_distance_meters,
                                           car_geometry, bike_minutes, bike_geometry, walk_minutes, walk_geometry,
                                           via_stops, estimate_mode, is_estimate, origin_name, origin_ref,
                                           reference_time, computed_at)
         VALUES (@listingId, @label, @originLat, @originLng, @transitMinutes, @transitTransfers, @transitLegs,
                 @carMinutes, @carDistanceMeters, @carGeometry, @bikeMinutes, @bikeGeometry, @walkMinutes,
                 @walkGeometry, @viaStops, @estimateMode, @isEstimate, @originName, @originRef,
                 @referenceTime, @computedAt)
         ON CONFLICT(listing_id, label) DO UPDATE SET
           origin_lat = excluded.origin_lat,
           origin_lng = excluded.origin_lng,
           transit_minutes = excluded.transit_minutes,
           transit_transfers = excluded.transit_transfers,
           transit_legs = excluded.transit_legs,
           car_minutes = excluded.car_minutes,
           car_distance_meters = excluded.car_distance_meters,
           car_geometry = excluded.car_geometry,
           bike_minutes = excluded.bike_minutes,
           bike_geometry = excluded.bike_geometry,
           walk_minutes = excluded.walk_minutes,
           walk_geometry = excluded.walk_geometry,
           via_stops = excluded.via_stops,
           estimate_mode = excluded.estimate_mode,
           is_estimate = excluded.is_estimate,
           origin_name = excluded.origin_name,
           origin_ref = excluded.origin_ref,
           reference_time = excluded.reference_time,
           computed_at = excluded.computed_at`,
      );

      for (const row of rows) {
        upsert.run({
          listingId,
          label: row.label,
          originLat: row.originLat,
          originLng: row.originLng,
          transitMinutes: row.transitMinutes ?? null,
          transitTransfers: row.transitTransfers ?? null,
          transitLegs: row.transitLegs == null ? null : JSON.stringify(row.transitLegs),
          carMinutes: row.carMinutes ?? null,
          carDistanceMeters: row.carDistanceMeters ?? null,
          carGeometry: row.carGeometry ?? null,
          bikeMinutes: row.bikeMinutes ?? null,
          bikeGeometry: row.bikeGeometry ?? null,
          walkMinutes: row.walkMinutes ?? null,
          walkGeometry: row.walkGeometry ?? null,
          viaStops: row.viaStops == null ? null : JSON.stringify(row.viaStops),
          estimateMode: row.estimateMode ?? null,
          isEstimate: row.isEstimate === false ? 0 : 1,
          // Null for a named address, which is its own answer. Only a place type has to record
          // which place it actually measured, and for which category.
          originName: row.originName ?? null,
          originRef: row.originRef ?? null,
          referenceTime: row.referenceTime,
          computedAt: row.computedAt ?? computedAt,
        });
      }
    }

    // Not stamped when the run could not finish this listing. The rows it did get are worth
    // keeping, but the listing has to stay due or the missing address waits for the refresh window.
    if (stamp) {
      db.prepare(
        `UPDATE listings
         SET travel_times_at = @computedAt,
             travel_times_failures = 0
         WHERE id = @listingId`,
      ).run({ listingId, computedAt });
    }
  });
};

/**
 * Record that a listing could not be routed to.
 *
 * Only for answers, never for outages. A request that timed out or ran into a rate limit says
 * nothing about the listing, and counting it would eventually retire perfectly good listings
 * because the upstream service had a bad afternoon.
 *
 * @param {string} listingId
 * @param {number} [checkedAt=Date.now()]
 * @returns {{changes: number}|undefined}
 */
export const recordTravelTimeFailure = (listingId, checkedAt = Date.now()) => {
  if (!listingId) return undefined;
  return SqliteConnection.execute(
    `UPDATE listings
     SET travel_times_failures = COALESCE(travel_times_failures, 0) + 1,
         travel_times_at = @checkedAt
     WHERE id = @listingId`,
    { listingId, checkedAt },
  );
};

/**
 * Mark listings as worth re-examining without throwing away what is stored.
 *
 * Used when the user's addresses changed. Deleting the rows here would be the expensive mistake:
 * adding a third address would then re-request the two that did not move. Clearing only the stamp
 * puts the listings back in front of the sweeper, which compares each stored row against the
 * addresses as they are now and pays only for the differences.
 *
 * @param {string[]} ids
 * @returns {{changes: number}|undefined}
 */
export const markTravelTimesDirty = (ids) => {
  return forEachIdChunk(ids, (chunk, db) =>
    db
      .prepare(
        `UPDATE listings
         SET travel_times_at = NULL,
             travel_times_failures = 0
         WHERE id IN (${chunk.map(() => '?').join(',')})`,
      )
      .run(chunk),
  );
};

/**
 * Reduce a list of listing ids to those the given user may act on.
 *
 * A listing belongs to whoever owns the job that found it, plus anyone that job is shared with.
 * Admins may act on everything. Deliberately ignores `manually_deleted`, because restoring a
 * soft-deleted listing has to pass this check too.
 *
 * Routes that mutate listings by id must run their input through this rather than trusting the
 * body: without it, any authenticated user could edit or hard-delete another user's listings just
 * by naming their id.
 *
 * @param {string[]} ids - Candidate listing ids (the nanoid primary keys).
 * @param {string|null} userId - The acting user.
 * @param {boolean} [isAdmin=false] - When true, every existing id is returned unchanged.
 * @returns {string[]} The subset of `ids` the user may act on, without duplicates.
 */
export const filterListingIdsForUser = (ids, userId, isAdmin = false) => {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
  if (unique.length === 0) return [];
  if (isAdmin) return unique;
  if (!userId) return [];

  const allowed = [];
  // Chunked so a large selection cannot exceed SQLite's bound-parameter limit.
  for (let offset = 0; offset < unique.length; offset += ID_CHUNK_SIZE) {
    const chunk = unique.slice(offset, offset + ID_CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = SqliteConnection.query(
      `SELECT l.id
       FROM listings l
              JOIN jobs j ON j.id = l.job_id
       WHERE l.id IN (${placeholders})
         AND (j.user_id = ? OR EXISTS (SELECT 1 FROM json_each(j.shared_with_user) AS sw WHERE sw.value = ?))`,
      [...chunk, userId, userId],
    );
    for (const row of rows) allowed.push(row.id);
  }
  return allowed;
};

/**
 * Whether a user may act on a single listing. Thin wrapper around
 * {@link filterListingIdsForUser} for the single-id routes.
 *
 * @param {string} id - The listing id.
 * @param {string|null} userId - The acting user.
 * @param {boolean} [isAdmin=false]
 * @returns {boolean}
 */
export const userCanAccessListing = (id, userId, isAdmin = false) =>
  filterListingIdsForUser([id], userId, isAdmin).length > 0;

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
    whereScoping = `AND ${USER_LISTING_POINT_SCOPE_SQL}`;
  }
  const row = parseListingStatus(
    SqliteConnection.query(
      `SELECT l.*, j.name AS job_name, j.deal_type AS dealType, CASE WHEN wl.id IS NOT NULL THEN 1 ELSE 0 END AS isWatched
     FROM listings l
     LEFT JOIN jobs j ON j.id = l.job_id
     LEFT JOIN watch_list wl ON wl.listing_id = l.id AND wl.user_id = @userId
     WHERE l.id = @id AND l.manually_deleted = 0 ${whereScoping}`,
      params,
    )[0] || null,
  );
  // The detail view is the one place that draws the driving route, so it is the one place the
  // encoded geometry is worth sending.
  return row == null ? null : attachTravelTimes([row], { includeGeometry: true })[0];
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
 * Overwrite a listing's address and coordinates with what the user says they are.
 *
 * The scraped values are replaced rather than kept alongside: portals get this wrong often enough
 * that keeping their version would only raise the question of which one is real. `address_is_manual`
 * is what stops the geocoding sweep from undoing the decision later.
 *
 * `distances` is cleared because it was computed from the coordinates that just changed; the caller
 * recomputes it. NULL rather than an empty array on purpose - `getListingsToCalculateDistance`
 * selects on NULL, so a user who has not configured any reference address yet still gets the
 * distances filled in by a later sweep.
 *
 * One knock-on effect is accepted here: the cross-provider duplicate cache is rebuilt hourly from
 * the stored rows, so after the next rebuild it holds the manual address rather than the scraped
 * one. Should another portal list the same flat afterwards, its scraped address hashes differently
 * and the flat can be reported a second time. The cache is best-effort by design, the listing
 * itself is still protected by its provider hash, and the alternative - keeping the scraped address
 * around purely to feed the cache - buys little for what it costs.
 *
 * @param {string} id - The listing ID.
 * @param {string} address - The address the user picked. Blank values are rejected.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {number} Number of rows affected (0 if the listing does not exist or the input is blank).
 */
export const setListingAddress = (id, address, latitude, longitude) => {
  if (!id) return 0;
  const trimmed = typeof address === 'string' ? address.trim() : '';
  if (trimmed.length === 0) return 0;

  let changes = 0;
  SqliteConnection.withTransaction((db) => {
    const res = db
      .prepare(
        `UPDATE listings
         SET address = @address,
             latitude = @latitude,
             longitude = @longitude,
             address_is_manual = 1,
             distances = NULL,
             travel_times_at = NULL,
             travel_times_failures = 0
         WHERE id = @id`,
      )
      .run({ id, address: trimmed, latitude, longitude });
    changes = res?.changes ?? 0;

    // Every stored journey started from the coordinates that just moved, so unlike an address
    // change on the user's side there is nothing here worth keeping: all of them have to be asked
    // again. The failure counter is reset too, because a listing that was unroutable at the wrong
    // coordinates says nothing about the right ones.
    db.prepare(`DELETE FROM listing_travel_times WHERE listing_id = @id`).run({ id });
  });
  return changes;
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
