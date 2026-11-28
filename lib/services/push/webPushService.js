/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as webPush from 'web-push';
import { getSettings, upsertSettings } from '../storage/settingsStorage.js';
import {
  dropPushSubscription,
  getPushSubscriptions,
  markPushError,
  markPushSuccess,
} from '../storage/pushSubscriptionStorage.js';
import logger from '../logger.js';

/**
 * Web Push for the browser notification channel (#542).
 *
 * Fredy talks to the browser vendors' push services (FCM, Mozilla, Apple) directly, signed with its
 * own VAPID key, so no third party is involved and the push service only ever sees ciphertext.
 */

/** The `settings` row holding the VAPID key pair. Listed as a secret in `settingsStorage.js`. */
export const VAPID_SETTING = 'web_push_vapid';

/**
 * The largest payload Fredy sends, in bytes of JSON. Push services accept 4096 bytes of ciphertext;
 * the encryption adds a header and padding, so the plaintext has to stay comfortably below that.
 */
export const MAX_PAYLOAD_BYTES = 3000;

/** How long a push service keeps a message for a device that is offline: a day. */
export const PUSH_TTL_SECONDS = 24 * 60 * 60;

/** Used as the VAPID contact when Fredy knows no https address of itself (local development). */
const FALLBACK_SUBJECT = 'mailto:fredy@localhost';

/** The creation in flight, if any. Cleared once it settled, so a restore is read afresh. */
let creatingKeys = null;

/**
 * The instance's VAPID key pair, created on first use and kept in `settings`.
 *
 * It must outlive restarts and survive backup and restore: every subscription is bound to the
 * public key it was made with, so a new key would silently cut off every device.
 *
 * Two first calls at the same time share one creation, so neither can hand a device a key the other
 * then overwrites.
 *
 * @returns {Promise<{publicKey: string, privateKey: string}>}
 */
export function getOrCreateVapidKeys() {
  if (creatingKeys == null) {
    creatingKeys = (async () => {
      const settings = await getSettings();
      const stored = settings[VAPID_SETTING];
      if (stored?.publicKey && stored?.privateKey) return stored;
      const keys = webPush.generateVAPIDKeys();
      upsertSettings({ [VAPID_SETTING]: keys });
      return keys;
    })().finally(() => {
      creatingKeys = null;
    });
  }
  return creatingKeys;
}

/**
 * Whether a string is an https URL.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
const isHttps = (value) => {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * The contact a push service can reach the operator under (VAPID `sub`).
 *
 * Apple refuses a token whose subject is not an https or mailto URL (`BadJwtToken`), so an http or
 * localhost `baseUrl` is no use there. The configured `baseUrl` wins when it is https; otherwise
 * the https origin the device subscribed from, which is where this Fredy is reachable.
 *
 * @param {string|undefined} baseUrl
 * @param {string|null|undefined} origin
 * @returns {string}
 */
export function vapidSubject(baseUrl, origin) {
  if (isHttps(baseUrl)) return baseUrl;
  if (isHttps(origin)) return origin;
  return FALLBACK_SUBJECT;
}

/**
 * Cut a string to at most `max` characters, marking the cut.
 *
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
const clip = (text, max) => (text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`);

/**
 * The JSON a device receives, kept below {@link MAX_PAYLOAD_BYTES}.
 *
 * The body is shortened first, then the picture goes, then the title, so whatever is left still
 * says which listing it is and still opens it.
 *
 * @param {{title: string, body?: string, url: string, tag: string, image?: string|null}} message
 * @returns {string}
 */
export function buildPushPayload({ title, body = '', url, tag, image = null }) {
  const payload = {
    title: clip(title || 'Fredy', 200),
    body: clip(body, 1000),
    url,
    tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    ...(typeof image === 'string' && image.startsWith('https://') ? { image } : {}),
  };
  const size = () => Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (size() > MAX_PAYLOAD_BYTES) payload.body = clip(payload.body, 300);
  if (size() > MAX_PAYLOAD_BYTES) delete payload.image;
  if (size() > MAX_PAYLOAD_BYTES) payload.title = clip(payload.title, 80);
  if (size() > MAX_PAYLOAD_BYTES) payload.body = '';
  return JSON.stringify(payload);
}

/**
 * The status codes with which a push service says the subscription no longer exists.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
const isGone = (error) => error?.statusCode === 404 || error?.statusCode === 410;

/**
 * What a failed push leaves on the device's row, which the user reads back in the device list.
 *
 * Only the status code, or the network error's code when there was no answer: the response body
 * is whatever the endpoint sent back, and the endpoint is a URL the user supplied. The full error
 * still goes to the log.
 *
 * @param {any} error
 * @returns {string}
 */
const storedError = (error) => {
  if (error?.statusCode) return `HTTP ${error.statusCode}`;
  return typeof error?.code === 'string' ? error.code : 'No response';
};

/**
 * Send one message to every device of a user.
 *
 * Each device is tried independently (`Promise.allSettled`), so one dead phone does not cost the
 * others their notification. A device the push service reports as gone is forgotten; any other
 * failure is recorded on the row and logged, and the device is kept.
 *
 * @param {string} userId
 * @param {{title: string, body?: string, url: string, tag: string, image?: string|null}} message
 * @param {{urgency?: 'very-low'|'low'|'normal'|'high'}} [options]
 * @returns {Promise<{sent: number, failed: number, removed: number}>}
 */
export async function sendPushToUser(userId, message, { urgency = 'normal' } = {}) {
  const result = { sent: 0, failed: 0, removed: 0 };
  if (!userId) return result;
  const subscriptions = getPushSubscriptions(userId);
  if (subscriptions.length === 0) return result;

  const [{ publicKey, privateKey }, settings] = await Promise.all([getOrCreateVapidKeys(), getSettings()]);
  const payload = buildPushPayload(message);

  const outcomes = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webPush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
        {
          vapidDetails: { subject: vapidSubject(settings.baseUrl, subscription.origin), publicKey, privateKey },
          TTL: PUSH_TTL_SECONDS,
          urgency,
          timeout: 15000,
        },
      ),
    ),
  );

  outcomes.forEach((outcome, index) => {
    const subscription = subscriptions[index];
    if (outcome.status === 'fulfilled') {
      markPushSuccess(subscription.id);
      result.sent += 1;
    } else if (isGone(outcome.reason)) {
      dropPushSubscription(subscription.id);
      result.removed += 1;
    } else {
      const reason = outcome.reason;
      markPushError(subscription.id, storedError(reason));
      const description = reason?.statusCode
        ? `${reason.statusCode} ${reason.body || reason.message || ''}`.trim()
        : reason?.message || String(reason);
      logger.warn(`Web push to a device of user ${userId} failed: ${description}`);
      result.failed += 1;
    }
  });

  return result;
}
