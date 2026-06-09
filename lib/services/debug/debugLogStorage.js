/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import SqliteConnection from '../storage/SqliteConnection.js';
import { upsertSettings, getSettings } from '../storage/settingsStorage.js';
import logger from '../logger.js';

/**
 * Hard cap on the total UTF-8 byte length of stored log MESSAGES (5 MiB).
 *
 * Note: this measures the payload bytes (message strings only); SQLite per-row
 * overhead (id, ts, level, byte_size columns + page housekeeping) means the actual
 * sqlite_master page count for debug_logs can be larger than this cap by a constant
 * factor. The cap is intentionally about user-visible payload to keep the math
 * predictable and to align with what ends up in logs.txt.
 *
 * The cap is enforced via a rolling buffer: when the live size exceeds it, the
 * oldest rows are removed until the size falls below the limit again.
 * @type {number}
 */
export const MAX_DEBUG_LOG_BYTES = 5 * 1024 * 1024;

/** Settings key persisting the active on/off flag. */
const SETTING_ENABLED = 'debug_logging_enabled';

/**
 * Settings key persisting "this feature has been turned on at least once". Used to
 * decide whether the download endpoint returns 409 (never enabled) or whether the
 * "delete previous logs?" confirm dialog should be shown on (re)enable.
 */
const SETTING_EVER_ENABLED = 'debug_logging_ever_enabled';

/**
 * Cached live byte size of all rows in debug_logs. Initialized lazily from the DB on
 * the first call and kept in sync by append / clear / trim. Storing this in-memory
 * avoids running SUM() on every single insert (logger writes can be very frequent).
 * @type {number|null}
 */
let cachedSize = null;

/**
 * Cached value of debug_logging_enabled. Reflects DB state; flipped by enable() /
 * disable() so the logger hot-path does not have to hit the settings cache for every
 * log line.
 * @type {boolean|null}
 */
let cachedEnabled = null;

/**
 * Compute the UTF-8 byte length of a string. Falls back to character count for
 * environments where Buffer is not available (vitest covers Node, so it always is).
 * @param {string} str
 * @returns {number}
 */
function byteLengthOf(str) {
  if (typeof str !== 'string') return 0;
  if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
    return Buffer.byteLength(str, 'utf-8');
  }
  return str.length;
}

/**
 * Read the current total byte size from the DB and update the local cache.
 * @returns {number}
 */
function refreshSizeFromDb() {
  const rows = SqliteConnection.query('SELECT COALESCE(SUM(byte_size), 0) AS total FROM debug_logs');
  cachedSize = Number(rows?.[0]?.total ?? 0);
  return cachedSize;
}

/**
 * Lazily ensure the cached enabled/size values are up to date. Called by every public
 * method that needs to know either value, so external init is not required.
 * @returns {Promise<void>}
 */
async function ensureCachesInitialized() {
  if (cachedEnabled == null) {
    const settings = await getSettings();
    cachedEnabled = settings[SETTING_ENABLED] === true;
  }
  if (cachedSize == null) {
    refreshSizeFromDb();
  }
}

/**
 * Cached prepared statements used by trimToFit(). Initialized on first use so we do
 * not pay the prepare cost on every overflow event, and skipped entirely when the
 * feature is never activated.
 * @type {{select:any, del:any}|null}
 */
let trimStatements = null;

/**
 * Drop the oldest rows from debug_logs until the cached size falls below
 * MAX_DEBUG_LOG_BYTES. Implements the rolling buffer behavior chosen for the feature.
 *
 * The deletion is performed in batches of up to 100 oldest rows wrapped in a single
 * transaction. The size cache is updated only after the transaction commits, so a
 * mid-batch failure (rolled back by SQLite) cannot leave cachedSize out of sync with
 * the on-disk reality. A defensive resync via SUM() is performed on transaction
 * failure to recover from any unexpected drift.
 *
 * @returns {void}
 */
function trimToFit() {
  if (cachedSize == null || cachedSize <= MAX_DEBUG_LOG_BYTES) return;

  const db = SqliteConnection.getConnection();
  if (trimStatements == null) {
    trimStatements = {
      select: db.prepare('SELECT id, byte_size FROM debug_logs ORDER BY id ASC LIMIT 100'),
      del: db.prepare('DELETE FROM debug_logs WHERE id = @id'),
    };
  }

  while (cachedSize > MAX_DEBUG_LOG_BYTES) {
    const oldest = trimStatements.select.all();
    if (oldest.length === 0) {
      // Table is empty but the cache still claims we are over the cap. That can only
      // happen if cachedSize drifted (e.g. external DB modification, zero-byte
      // messages that never contributed to SUM(byte_size), or a previous trim that
      // partially succeeded). Resync from the source of truth and bail out.
      refreshSizeFromDb();
      break;
    }

    // Pick exactly enough oldest rows to bring the cache back under the cap. We do
    // NOT delete the entire 100-row batch unconditionally, that would over-trim in
    // edge cases where just one or two rows are enough.
    const needToFree = cachedSize - MAX_DEBUG_LOG_BYTES;
    let freed = 0;
    const idsToDelete = [];
    for (const row of oldest) {
      idsToDelete.push(row.id);
      freed += Number(row.byte_size) || 0;
      if (freed >= needToFree) break;
    }

    try {
      const tx = db.transaction((ids) => {
        for (const id of ids) {
          trimStatements.del.run({ id });
        }
      });
      tx(idsToDelete);
      // Only decrement after the transaction has committed; a mid-batch failure
      // would roll the DELETEs back and leave cachedSize untouched.
      cachedSize -= freed;
      if (freed === 0) {
        // We deleted rows but they all had byte_size <= 0, so cachedSize did not
        // move. Without intervention the outer loop would spin again with the same
        // condition. Resync from the DB and bail to prevent that.
        refreshSizeFromDb();
        break;
      }
    } catch {
      // SQLite rolled the batch back; resync cachedSize from the DB to recover from
      // any unexpected drift, then bail out so we do not spin forever on a persistent
      // failure (e.g. database is locked or read-only).
      refreshSizeFromDb();
      break;
    }
  }
  if (cachedSize < 0) cachedSize = 0;
}

/**
 * Whether debug logging is currently enabled. Synchronous and cheap so the logger
 * hot-path can call it on every log line.
 *
 * @returns {boolean} True if logs should be persisted to the debug_logs table.
 */
export function isEnabled() {
  return cachedEnabled === true;
}

/**
 * Append a single log entry to debug_logs (if enabled) and trim the rolling buffer if
 * the new row pushes the live size above the cap.
 *
 * Safe to call even when logging is disabled, it becomes a no-op. Any storage error
 * is swallowed so the logger never breaks the calling code; bookkeeping for cachedSize
 * stays consistent because we update it only after a successful insert.
 *
 * @param {{ts:number, level:string, message:string}} entry
 * @returns {void}
 */
export function appendLogEntry(entry) {
  if (!isEnabled()) return;
  if (!entry || typeof entry.message !== 'string') return;

  try {
    const ts = Number.isFinite(entry.ts) ? entry.ts : Date.now();
    const level = String(entry.level || 'info');
    const message = entry.message;
    const byte_size = byteLengthOf(message);

    SqliteConnection.execute(
      'INSERT INTO debug_logs (ts, level, message, byte_size) VALUES (@ts, @level, @message, @byte_size)',
      { ts, level, message, byte_size },
    );

    if (cachedSize == null) {
      refreshSizeFromDb();
    } else {
      cachedSize += byte_size;
    }
    trimToFit();
  } catch {
    // Logging must never break the application. Swallow storage errors silently.
  }
}

/**
 * Remove every row from debug_logs and reset the cached size to zero. Used by both
 * the "clear previous logs" path on (re)enable and by explicit clear actions.
 *
 * @returns {void}
 */
export function clearAllDebugLogs() {
  SqliteConnection.execute('DELETE FROM debug_logs');
  cachedSize = 0;
}

/**
 * Return the cached live byte size of the debug_logs table contents.
 * @returns {Promise<number>}
 */
export async function getCurrentSize() {
  await ensureCachesInitialized();
  return cachedSize ?? 0;
}

/**
 * Return the configured maximum size for the debug_logs table.
 * @returns {number}
 */
export function getMaxSize() {
  return MAX_DEBUG_LOG_BYTES;
}

/**
 * Check whether the debug_logs table contains at least one row.
 * @returns {boolean}
 */
export function hasAnyLogs() {
  const row = SqliteConnection.query('SELECT 1 AS one FROM debug_logs LIMIT 1');
  return Array.isArray(row) && row.length > 0;
}

/**
 * Has debug logging ever been enabled in this installation? Used by the download
 * endpoint to distinguish "no logs yet" (empty table) from "feature never used"
 * (which returns 409 to surface a friendlier UI error).
 *
 * @returns {Promise<boolean>}
 */
export async function wasEverEnabled() {
  const settings = await getSettings();
  return settings[SETTING_EVER_ENABLED] === true;
}

/**
 * Turn debug logging on. Persists both the active flag and the "ever enabled" flag,
 * optionally clearing previous logs when the caller passes clearPrevious=true (this
 * is the path taken when the UI confirm dialog "Delete previous logs?" is accepted).
 *
 * @param {object} [options]
 * @param {boolean} [options.clearPrevious=false]
 * @returns {Promise<void>}
 */
export async function enableDebugLogging({ clearPrevious = false } = {}) {
  if (clearPrevious) {
    clearAllDebugLogs();
  }
  upsertSettings({ [SETTING_ENABLED]: true, [SETTING_EVER_ENABLED]: true });
  cachedEnabled = true;
  if (cachedSize == null) {
    refreshSizeFromDb();
  }
  // Attach the logger sink only while recording is on so the logger hot path pays
  // no per-call cost (Date.now + stringifyArgs) when nobody enabled the feature.
  logger.setDebugLogSink(appendLogEntry);
}

/**
 * Turn debug logging off. Previous logs are kept on disk so the user can still
 * download them; they are only cleared when the user re-enables and chooses "delete
 * previous logs".
 *
 * @returns {Promise<void>}
 */
export async function disableDebugLogging() {
  upsertSettings({ [SETTING_ENABLED]: false });
  cachedEnabled = false;
  // Detach the sink so the logger hot path returns immediately on its `if (sink)`
  // check instead of paying the no-op cost on every log line.
  logger.setDebugLogSink(null);
}

/**
 * Return all stored log entries ordered chronologically. Used by the bundle builder
 * when assembling logs.txt.
 *
 * @returns {{id:number, ts:number, level:string, message:string}[]}
 */
export function getAllDebugLogs() {
  return SqliteConnection.query('SELECT id, ts, level, message FROM debug_logs ORDER BY id ASC');
}

/**
 * Reload the cached enabled flag from settings storage. Called from the logger at
 * startup so the cache reflects the persisted state after a Fredy restart.
 *
 * @returns {Promise<boolean>} The active enabled flag.
 */
export async function reloadEnabledFromSettings() {
  const settings = await getSettings();
  cachedEnabled = settings[SETTING_ENABLED] === true;
  // (Un)wire the sink to match the persisted state. Note: startup work that runs
  // before index.js calls this (CloakBrowser binary check, runMigrations) still
  // logs to stdout only, since the sink is not attached yet at that point.
  if (cachedEnabled) {
    logger.setDebugLogSink(appendLogEntry);
  } else {
    logger.setDebugLogSink(null);
  }
  return cachedEnabled;
}

/**
 * Test-only helper to drop in-memory caches between unit tests. Resets every piece
 * of module-scoped mutable state so a test that swaps the underlying DB does not
 * inherit stale prepared statements from a previous run.
 * @returns {void}
 */
export function _resetForTests() {
  cachedSize = null;
  cachedEnabled = null;
  trimStatements = null;
}
