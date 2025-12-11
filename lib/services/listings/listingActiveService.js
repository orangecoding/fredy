/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { deactivateListings, getActiveOrUnknownListings } from '../storage/listingsStorage.js';
import { getProviders } from '../../utils.js';
import logger from '../../services/logger.js';

/**
 * Runs the active-listing checker:
 * 1) Loads all listings with unknown or active status.
 * 2) Resolves each listing's provider and calls its `activeTester(link)`.
 * 3) Collects listings that are no longer active and deactivates them in one batch.
 *
 * Concurrency: network-bound checks are executed with a configurable concurrency limit.
 *
 * @param {object} [opts]
 * @param {number} [opts.concurrency=8] Max number of parallel activeTester calls.
 * @returns {Promise<void>}
 */
export default async function runActiveChecker(opts = {}) {
  const { concurrency = 4 } = opts;

  const listings = getActiveOrUnknownListings();
  if (!Array.isArray(listings) || listings.length === 0) {
    logger.debug('No listings to check.');
    return;
  }

  const providers = await getProviders();
  if (!Array.isArray(providers) || providers.length === 0) {
    logger.warn('No providers available. Skipping active checks.');
    return;
  }

  // Build a map for O(1) provider lookup by id
  /** @type {Record<string, any>} */
  const providerById = Object.create(null);
  for (const p of providers) {
    const id = p?.metaInformation?.id;
    if (id) providerById[id] = p;
  }

  // Small generic mapLimit to cap concurrency without extra deps
  /**
   * @template T, R
   * @param {T[]} items
   * @param {number} limit
   * @param {(item: T, index: number) => Promise<R>} worker
   * @returns {Promise<R[]>}
   */
  async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;

    async function runOne() {
      while (next < items.length) {
        const i = next++;
        try {
          results[i] = await worker(items[i], i);
        } catch (err) {
          results[i] = /** @type {any} */ (err);
        }
      }
    }

    const runners = Array.from({ length: Math.min(limit, items.length) }, runOne);
    await Promise.all(runners);
    return results;
  }

  /** @type {string[]} */
  const listingsSetToInactive = [];

  await mapLimit(listings, concurrency, async (listing) => {
    const { provider: listingProviderId, link, id } = listing || {};

    const matchedProvider = providerById[listingProviderId];
    if (!matchedProvider) {
      logger.warn('Could not find matching provider for', listingProviderId);
      return;
    }
    const tester = matchedProvider?.config?.activeTester;
    if (typeof tester !== 'function') {
      logger.warn('No activeTester configured for', listingProviderId);
      return;
    }

    // Contract: activeTester(link) returns 1 if active, 0 if inactive
    let result;
    try {
      result = await tester(link);
    } catch {
      result = -1;
    }

    if (result === 0 && id) {
      listingsSetToInactive.push(id);
    }
  });

  if (listingsSetToInactive.length > 0) {
    logger.info(`Setting ${listingsSetToInactive.length} listings to inactive.`);
    deactivateListings(listingsSetToInactive);
  } else {
    logger.debug('No listings need to be set inactive.');
  }
}
