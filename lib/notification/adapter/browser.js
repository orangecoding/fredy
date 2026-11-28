/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readAdapterReadme } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import { sendToUser } from '../../services/sse/sse-broker.js';
import { sendPushToUser } from '../../services/push/webPushService.js';
import logger from '../../services/logger.js';
import { priceChangeTitle, priceChangeBody } from '../priceChangeMessage.js';

/**
 * The notification tag of a new listing. The open tab and the service worker use the same one, so
 * a device that gets both shows the listing once.
 *
 * @param {string} id
 * @returns {string}
 */
export const listingTag = (id) => `fredy-listing-${id}`;

/**
 * The notification tag of a price change.
 *
 * @param {string} id
 * @returns {string}
 */
export const priceChangeTag = (id) => `fredy-price-${id}`;

/**
 * Where a push opens: the listing in Fredy. Relative, so it works without `baseUrl`, and in Fredy
 * rather than on the portal, because inside the home-screen app that is where you want to land.
 *
 * @param {string} id
 * @returns {string}
 */
const listingPath = (id) => `/#/listings/listing/${id}`;

/**
 * Where the push of a channel test opens. The sample listing it carries is not stored, so its own
 * page would not exist; the notification settings are where the test was started from.
 */
const TEST_PUSH_PATH = '/#/settings/notifications';

/**
 * Send every message as Web Push to the user's devices, one after the other, so they arrive in
 * the order of the listings.
 *
 * Callers start it without awaiting it: a push service that cannot be reached takes up to the 15 s
 * timeout per message, and the job run must not wait for that. A failing push never fails the
 * channel either: the open tab may have shown the notification already, and the devices' own
 * errors are recorded on their rows.
 *
 * @param {string} userId
 * @param {Array<Parameters<typeof sendPushToUser>[1]>} messages
 * @param {'normal'|'high'} urgency
 * @returns {Promise<void>}
 */
async function pushAll(userId, messages, urgency) {
  for (const message of messages) {
    try {
      await sendPushToUser(userId, message, { urgency });
    } catch (error) {
      logger.warn('Web push for the browser channel failed', error);
    }
  }
}

/**
 * @param {{serviceName: string, newListings: any[], jobKey: string, baseUrl: string, userId?: string, isTest?: boolean}} params
 *   `isTest` is set by the channel test (`testFire`), whose sample listing does not exist in Fredy.
 * @returns {Promise<void>}
 */
export const send = async ({ serviceName, newListings, jobKey, baseUrl, userId, isTest = false }) => {
  const targetUserId = userId || getJob(jobKey)?.userId;

  if (!targetUserId) {
    return;
  }

  const messages = newListings.map((listing) => {
    const title = listing.title || 'New Listing Found';

    const meta = [listing.price && `Price: ${listing.price}`, listing.size && `Size: ${listing.size}`]
      .filter(Boolean)
      .join(' | ');
    const body = [meta, listing.address && `Address: ${listing.address}`, listing.commute].filter(Boolean).join('\n');
    const link = listing.link || (baseUrl ? `${baseUrl}/#/listings/listing/${listing.id}` : '');

    sendToUser(targetUserId, 'notification:browser', {
      id: listing.id,
      title,
      body,
      link,
      image: listing.image,
      tag: listingTag(listing.id),
      jobKey,
      serviceName,
    });

    const url = isTest ? TEST_PUSH_PATH : listingPath(listing.id);
    return { title, body, url, tag: listingTag(listing.id), image: listing.image };
  });

  void pushAll(targetUserId, messages, 'high');
};

/**
 * @param {{serviceName: string, priceChanges: any[], jobKey: string, baseUrl: string, userId?: string}} params
 * @returns {Promise<void>}
 */
export const sendPriceChange = async ({ serviceName, priceChanges, jobKey, baseUrl, userId }) => {
  const targetUserId = userId || getJob(jobKey)?.userId;
  if (!targetUserId) {
    return;
  }

  const messages = priceChanges.map((change) => {
    const title = priceChangeTitle(change);
    // Its own channel rather than `notification:browser`: the UI shows a different icon and lets
    // the user mute price changes without losing new-listing alerts.
    sendToUser(targetUserId, 'notification:priceChange', {
      id: change.id,
      title,
      body: priceChangeBody(change, baseUrl),
      link: change.link || (baseUrl ? `${baseUrl}/#/listings/listing/${change.id}` : ''),
      image: change.image,
      tag: priceChangeTag(change.id),
      direction: change.direction,
      jobKey,
      serviceName,
    });

    // The push carries what fits a lock screen; the links of the long body are one tap away in
    // Fredy, which is where the push opens.
    const body = [change.title, change.address && `Address: ${change.address}`].filter(Boolean).join('\n');
    return { title, body, url: listingPath(change.id), tag: priceChangeTag(change.id), image: change.image };
  });

  void pushAll(targetUserId, messages, 'normal');
};

export const config = {
  id: 'browser',
  name: 'Browser Notifications',
  description:
    'Displays native notifications in your browser, and as Web Push on every device where push is enabled under Settings → Notification channels.',
  config: {},
  readme: readAdapterReadme('lib/notification/adapter/browser.md'),
};
