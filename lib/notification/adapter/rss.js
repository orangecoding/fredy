/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readAdapterReadme } from '../../services/markdown.js';
import { getJob } from '../../services/storage/jobStorage.js';
import { addFeedItems, getFeedChannel, FEED_ADAPTER_ID } from '../../services/storage/notificationFeedStorage.js';
import { normalizeImageUrl } from '../../utils.js';
import { priceChangeBody, priceChangeTitle } from '../priceChangeMessage.js';

/**
 * The channel this notification is for, found through its feed token.
 *
 * The token rather than the channel id, because the test button only hands an adapter the fields:
 * this way a test lands in the real feed like a Telegram test lands in the real chat. A draft that
 * was never saved has no token yet, so there is no feed to write to.
 *
 * @param {Array<{fields?: Record<string, any>}>} notificationConfig
 * @returns {{id: string}}
 * @throws {Error} When no rss channel owns the token.
 */
const resolveChannel = (notificationConfig) => {
  const channel = getFeedChannel(notificationConfig?.[0]?.fields?.token);
  if (channel == null) {
    throw new Error('This RSS feed does not exist yet. Save the channel first, then its feed url can be copied.');
  }
  return channel;
};

/**
 * @param {string} jobKey
 * @returns {string}
 */
const jobNameOf = (jobKey) => getJob(jobKey)?.name ?? jobKey;

/**
 * @param {string|null|undefined} image
 * @returns {string|null}
 */
const imageOf = (image) => (typeof image === 'string' && image.length > 0 ? normalizeImageUrl(image) : null);

/**
 * @param {string} baseUrl
 * @param {string} id
 * @returns {string|null}
 */
const fredyLine = (baseUrl, id) => (baseUrl && id ? `Open in Fredy: ${baseUrl}/#/listings/listing/${id}` : null);

/**
 * Keep new listings in the channel's feed.
 *
 * The title carries the job's name because one channel can serve several jobs, and in a reader the
 * feed is a single list.
 *
 * @param {{serviceName: string, newListings: Object[], notificationConfig: any[], jobKey: string, baseUrl?: string}} params
 * @returns {Promise<void>}
 */
export const send = async ({ newListings, notificationConfig, jobKey, baseUrl }) => {
  const channel = resolveChannel(notificationConfig);
  const jobName = jobNameOf(jobKey);
  addFeedItems(
    channel.id,
    newListings.map((listing) => ({
      kind: 'listing',
      title: `${jobName}: ${listing.title ?? 'New listing'}`,
      link: listing.link ?? null,
      imageUrl: imageOf(listing.image),
      description: [
        [listing.price, listing.size, listing.rooms].filter(Boolean).join(' | '),
        listing.address ? `Address: ${listing.address}` : null,
        listing.commute ? `Commute: ${listing.commute}` : null,
        fredyLine(baseUrl, listing.id),
      ]
        .filter(Boolean)
        .join('\n'),
    })),
  );
};

/**
 * Keep price changes in the channel's feed, as items of their own next to the listing they concern.
 *
 * @param {{serviceName: string, priceChanges: any[], notificationConfig: any[], jobKey: string, baseUrl?: string}} params
 * @returns {Promise<void>}
 */
export const sendPriceChange = async ({ priceChanges, notificationConfig, jobKey, baseUrl }) => {
  const channel = resolveChannel(notificationConfig);
  const jobName = jobNameOf(jobKey);
  addFeedItems(
    channel.id,
    priceChanges.map((change) => ({
      kind: 'priceChange',
      title: `${jobName}: ${priceChangeTitle(change)}`,
      link: change.link ?? null,
      imageUrl: imageOf(change.image),
      description: priceChangeBody(change, baseUrl),
    })),
  );
};

export const config = {
  id: FEED_ADAPTER_ID,
  name: 'RSS feed',
  readme: readAdapterReadme('rss.md'),
  description: 'Fredy keeps new listings in an RSS feed that your feed reader can subscribe to.',
  fields: {
    token: {
      type: 'text',
      label: 'Feed url',
      description: 'Anyone who has the url can read the feed, so keep it to yourself.',
      // The token is the feed's only credential.
      secret: true,
      // Fredy creates the value; the form shows it and offers a new one, but never takes one typed in.
      generated: true,
      // What the form puts in front of the value to make the url it copies.
      urlPath: '/api/feed/',
    },
  },
};
