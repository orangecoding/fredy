/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';
import SqliteConnection from './SqliteConnection.js';

/**
 * A device's Web Push subscription as the sender needs it.
 *
 * @typedef {Object} PushSubscription
 * @property {string} id
 * @property {string} userId
 * @property {string} endpoint
 * @property {string} p256dh
 * @property {string} auth
 * @property {string|null} origin
 */

/**
 * A device as the settings page lists it. The keys stay on the server: the page has no use for
 * them, and the endpoint is enough to tell which row is the device the page is open on.
 *
 * @typedef {Object} PushDevice
 * @property {string} id
 * @property {string} endpoint
 * @property {string|null} userAgent
 * @property {number} createdAt
 * @property {number|null} lastSuccessAt
 * @property {string|null} lastError
 */

/**
 * Store a subscription for a user, or refresh the one this endpoint already has.
 *
 * Keyed on the endpoint, so a browser that subscribes again (a new permission grant, a
 * `pushsubscriptionchange`, the app re-syncing on load) keeps one row. An endpoint that arrives
 * under a different user moves to that user: the browser profile belongs to whoever signed in on it
 * last, and pushing the previous user's listings to it would hand them to somebody else.
 *
 * @param {string} userId
 * @param {{endpoint: string, p256dh: string, auth: string, origin?: string|null, userAgent?: string|null}} subscription
 * @param {number} [now]
 * @returns {void}
 */
export const upsertPushSubscription = (
  userId,
  { endpoint, p256dh, auth, origin = null, userAgent = null },
  now = Date.now(),
) => {
  SqliteConnection.execute(
    `INSERT INTO push_subscription (id, user_id, endpoint, p256dh, auth, origin, user_agent, created_at)
     VALUES (@id, @userId, @endpoint, @p256dh, @auth, @origin, @userAgent, @now)
     ON CONFLICT(endpoint) DO UPDATE SET
       created_at = CASE WHEN push_subscription.user_id = excluded.user_id THEN push_subscription.created_at ELSE excluded.created_at END,
       last_success_at = CASE WHEN push_subscription.user_id = excluded.user_id THEN push_subscription.last_success_at END,
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       origin = excluded.origin,
       user_agent = excluded.user_agent,
       last_error = NULL`,
    { id: nanoid(), userId, endpoint, p256dh, auth, origin, userAgent, now },
  );
};

/**
 * Every subscription of a user, i.e. every device a notification for them goes to.
 *
 * @param {string} userId
 * @returns {PushSubscription[]}
 */
export const getPushSubscriptions = (userId) =>
  SqliteConnection.query(
    `SELECT id, user_id AS userId, endpoint, p256dh, auth, origin
     FROM push_subscription
     WHERE user_id = @userId
     ORDER BY created_at`,
    { userId },
  );

/**
 * A user's devices for the settings page, oldest first.
 *
 * @param {string} userId
 * @returns {PushDevice[]}
 */
export const listPushDevices = (userId) =>
  SqliteConnection.query(
    `SELECT id, endpoint, user_agent AS userAgent, created_at AS createdAt,
            last_success_at AS lastSuccessAt, last_error AS lastError
     FROM push_subscription
     WHERE user_id = @userId
     ORDER BY created_at`,
    { userId },
  );

/**
 * Remove one of a user's subscriptions, by endpoint or by id. Another user's row is never touched.
 *
 * @param {string} userId
 * @param {{endpoint?: string, id?: string}} which
 * @returns {boolean} Whether a row was removed.
 */
export const removePushSubscription = (userId, { endpoint, id }) => {
  if (typeof endpoint === 'string' && endpoint.length > 0) {
    return (
      SqliteConnection.execute(`DELETE FROM push_subscription WHERE user_id = @userId AND endpoint = @endpoint`, {
        userId,
        endpoint,
      }).changes > 0
    );
  }
  if (typeof id === 'string' && id.length > 0) {
    return (
      SqliteConnection.execute(`DELETE FROM push_subscription WHERE user_id = @userId AND id = @id`, { userId, id })
        .changes > 0
    );
  }
  return false;
};

/**
 * Forget a subscription the push service reported as gone (404/410).
 *
 * @param {string} id
 * @returns {void}
 */
export const dropPushSubscription = (id) => {
  SqliteConnection.execute(`DELETE FROM push_subscription WHERE id = @id`, { id });
};

/**
 * Record that a push reached the push service.
 *
 * @param {string} id
 * @param {number} [now]
 * @returns {void}
 */
export const markPushSuccess = (id, now = Date.now()) => {
  SqliteConnection.execute(`UPDATE push_subscription SET last_success_at = @now, last_error = NULL WHERE id = @id`, {
    id,
    now,
  });
};

/**
 * Record why a push failed, keeping the subscription: a timeout or a 5xx says nothing about
 * whether the device is still there.
 *
 * @param {string} id
 * @param {string} error
 * @returns {void}
 */
export const markPushError = (id, error) => {
  SqliteConnection.execute(`UPDATE push_subscription SET last_error = @error WHERE id = @id`, {
    id,
    error: String(error).slice(0, 500),
  });
};
