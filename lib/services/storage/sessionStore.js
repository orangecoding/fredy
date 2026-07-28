/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import SqliteConnection from './SqliteConnection.js';
import logger from '../logger.js';

/**
 * Fallback lifetime for a session whose cookie carries no expiry.
 *
 * Only used to decide when the row may be deleted; whether a session is still *valid* is decided
 * by `security.js` against the live `sessionTTL` setting.
 * @type {number}
 */
const DEFAULT_ROW_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A @fastify/session store backed by the SQLite database Fredy already opens.
 *
 * Replaces the library's default in-memory store, which loses every session on restart (so every
 * upgrade logs all users out), grows without bound because nothing evicts expired entries, and
 * makes running more than one process impossible.
 *
 * Implements the callback-style store interface @fastify/session expects: `set`, `get`, `destroy`.
 * All three are synchronous underneath - better-sqlite3 is - but still answer through the callback,
 * deferred so a throwing callback cannot unwind back into the caller.
 */
export class SqliteSessionStore {
  /**
   * Persist a session.
   *
   * @param {string} sessionId
   * @param {Object} session - The session object, including its cookie.
   * @param {(err?: Error) => void} callback
   * @returns {void}
   */
  set(sessionId, session, callback) {
    try {
      const expiresAt = expiryOf(session);
      SqliteConnection.execute(
        `INSERT INTO sessions (sid, data, expires_at)
         VALUES (@sid, @data, @expiresAt)
         ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
        { sid: sessionId, data: JSON.stringify(session), expiresAt },
      );
      queueMicrotask(() => callback());
    } catch (error) {
      logger.error('Failed to persist session', error);
      queueMicrotask(() => callback(error));
    }
  }

  /**
   * Load a session.
   *
   * An expired row is treated as absent and removed on the way out, so an abandoned session cannot
   * be resurrected by a cookie that outlived it.
   *
   * @param {string} sessionId
   * @param {(err: Error|null, session?: Object|null) => void} callback
   * @returns {void}
   */
  get(sessionId, callback) {
    try {
      const row = SqliteConnection.query(`SELECT data, expires_at AS expiresAt FROM sessions WHERE sid = @sid`, {
        sid: sessionId,
      })[0];

      if (row == null) {
        return queueMicrotask(() => callback(null, null));
      }
      if (Number(row.expiresAt) <= Date.now()) {
        SqliteConnection.execute(`DELETE FROM sessions WHERE sid = @sid`, { sid: sessionId });
        return queueMicrotask(() => callback(null, null));
      }

      const session = JSON.parse(row.data);
      queueMicrotask(() => callback(null, session));
    } catch (error) {
      logger.error('Failed to read session', error);
      queueMicrotask(() => callback(error));
    }
  }

  /**
   * Remove a session (logout).
   *
   * @param {string} sessionId
   * @param {(err?: Error) => void} callback
   * @returns {void}
   */
  destroy(sessionId, callback) {
    try {
      SqliteConnection.execute(`DELETE FROM sessions WHERE sid = @sid`, { sid: sessionId });
      queueMicrotask(() => callback());
    } catch (error) {
      logger.error('Failed to destroy session', error);
      queueMicrotask(() => callback(error));
    }
  }
}

/**
 * When the row may be deleted, taken from the session cookie's own expiry.
 *
 * @param {{cookie?: {expires?: string|Date, originalMaxAge?: number, maxAge?: number}}} session
 * @returns {number} Epoch milliseconds.
 */
function expiryOf(session) {
  const cookie = session?.cookie;
  if (cookie?.expires != null) {
    const asDate = cookie.expires instanceof Date ? cookie.expires : new Date(cookie.expires);
    const time = asDate.getTime();
    if (Number.isFinite(time)) return time;
  }
  const maxAge = Number(cookie?.originalMaxAge ?? cookie?.maxAge);
  return Date.now() + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge : DEFAULT_ROW_TTL_MS);
}

/**
 * Delete every expired session row.
 *
 * Scheduling lives in `lib/services/crons/session-cleanup-cron.js` alongside Fredy's other
 * periodic work, rather than in a `setInterval` this module armed for itself.
 *
 * @param {number} [now=Date.now()]
 * @returns {number} How many rows were removed.
 */
export function sweepExpiredSessions(now = Date.now()) {
  try {
    const result = SqliteConnection.execute(`DELETE FROM sessions WHERE expires_at <= @now`, { now });
    return result?.changes ?? 0;
  } catch (error) {
    logger.warn('Failed to sweep expired sessions', error?.message || error);
    return 0;
  }
}
