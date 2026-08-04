/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readAdapterReadme } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import { sendToUser } from '../../services/sse/sse-broker.js';
import { priceChangeTitle, priceChangeBody } from '../priceChangeMessage.js';

export const send = ({ serviceName, newListings, jobKey, baseUrl, userId }) => {
  const targetUserId = userId || getJob(jobKey)?.userId;

  if (!targetUserId) {
    return Promise.resolve();
  }

  newListings.forEach((listing) => {
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
      jobKey,
      serviceName,
    });
  });

  return Promise.resolve();
};

/**
 * @param {{serviceName: string, priceChanges: any[], jobKey: string, baseUrl: string, userId?: string}} params
 * @returns {Promise<void>}
 */
export const sendPriceChange = ({ serviceName, priceChanges, jobKey, baseUrl, userId }) => {
  const targetUserId = userId || getJob(jobKey)?.userId;
  if (!targetUserId) {
    return Promise.resolve();
  }

  priceChanges.forEach((change) => {
    // Its own channel rather than `notification:browser`: the UI shows a different icon and lets
    // the user mute price changes without losing new-listing alerts.
    sendToUser(targetUserId, 'notification:priceChange', {
      id: change.id,
      title: priceChangeTitle(change),
      body: priceChangeBody(change, baseUrl),
      link: change.link || (baseUrl ? `${baseUrl}/#/listings/listing/${change.id}` : ''),
      image: change.image,
      direction: change.direction,
      jobKey,
      serviceName,
    });
  });

  return Promise.resolve();
};

export const config = {
  id: 'browser',
  name: 'Browser Notifications',
  description: 'Displays native desktop push notifications directly in your browser.',
  config: {},
  readme: readAdapterReadme('lib/notification/adapter/browser.md'),
};
