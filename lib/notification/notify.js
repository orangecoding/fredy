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
  return notificationConfig
    .map((notificationAdapter) => {
      const found = findAdapter(notificationAdapter);
      if (!found) {
        logger.warn(`Notification adapter '${notificationAdapter.id}' not found for job '${jobKey || ''}'`);
      }
      return found;
    })
    .filter(Boolean)
    .map((a) => a.send({ serviceName, newListings, notificationConfig, jobKey, baseUrl }));
};
