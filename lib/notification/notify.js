/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../services/logger.js';
import { getNotificationAdapters } from '../utils.js';

/** Every integration in ./adapter, loaded through the shared, CWD-independent plugin loader. */
const adapter = await getNotificationAdapters();

if (adapter.length === 0) {
  throw new Error('Please specify at least one notification provider');
}

/**
 * @param {{id: string}} notificationAdapter
 * @returns {any|undefined}
 */
const findAdapter = (notificationAdapter) => {
  return adapter.find((a) => a.config?.id === notificationAdapter.id);
};

/**
 * Dispatch one batch of listings to every adapter the job has configured.
 *
 * @param {string} serviceName
 * @param {Object[]} newListings
 * @param {Array<{id: string}>} notificationConfig
 * @param {string} jobKey
 * @param {string} baseUrl
 * @returns {Promise<any>[]} One promise per adapter that was found.
 */
export const send = (serviceName, newListings, notificationConfig, jobKey, baseUrl) => {
  //this is not being used in tests, therefore adapter are always set
  return resolveAdapters(notificationConfig, jobKey).map((a) =>
    a.send({ serviceName, newListings, notificationConfig, jobKey, baseUrl }),
  );
};

/**
 * Resolve a job's configured adapter ids to adapter modules, warning about the ones that are gone.
 *
 * @param {Array<{id: string}>} notificationConfig
 * @param {string} jobKey
 * @returns {any[]}
 */
const resolveAdapters = (notificationConfig, jobKey) => {
  return notificationConfig
    .map((notificationAdapter) => {
      const found = findAdapter(notificationAdapter);
      if (!found) {
        logger.warn(`Notification adapter '${notificationAdapter.id}' not found for job '${jobKey || ''}'`);
      }
      return found;
    })
    .filter(Boolean);
};

/**
 * Turn a price change into something an adapter that only knows `send` can still render.
 *
 * Used for third-party adapters that predate price tracking. The change is folded into the title
 * because that is the one field every adapter is guaranteed to show; silently sending them a
 * listing that reads as brand new would be worse than sending nothing.
 *
 * @param {import('../utils/formatListing.js').FormattedPriceChange} change
 * @returns {Object}
 */
const toFallbackListing = (change) => ({
  ...change,
  title: `${change.changeHeadline}: ${change.oldPrice} -> ${change.newPrice} (${change.changePercent}) - ${change.title}`,
});

/**
 * Dispatch one batch of price changes to every adapter the job has configured.
 *
 * Adapters opt in by exporting `sendPriceChange`. One that does not gets the batch through its
 * regular `send` with the change folded into the title, so an adapter written before this feature
 * existed keeps working rather than silently dropping the notification.
 *
 * @param {string} serviceName
 * @param {import('../utils/formatListing.js').FormattedPriceChange[]} priceChanges
 * @param {Array<{id: string}>} notificationConfig
 * @param {string} jobKey
 * @param {string} baseUrl
 * @returns {Promise<any>[]} One promise per adapter that was found.
 */
export const sendPriceChange = (serviceName, priceChanges, notificationConfig, jobKey, baseUrl) => {
  return resolveAdapters(notificationConfig, jobKey).map((a) => {
    if (typeof a.sendPriceChange === 'function') {
      return a.sendPriceChange({ serviceName, priceChanges, notificationConfig, jobKey, baseUrl });
    }
    return a.send({
      serviceName,
      newListings: priceChanges.map(toFallbackListing),
      notificationConfig,
      jobKey,
      baseUrl,
    });
  });
};
