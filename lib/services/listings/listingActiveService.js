/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { deactivateListings, getListingsDueForActiveCheck, markListingsChecked } from '../storage/listingsStorage.js';
import { getProviders } from '../../utils.js';
import logger from '../../services/logger.js';

/**
 * Runs the active-listing checker:
 * 1) Loads the listings that are due for a probe (never checked, or checked long enough ago).
 * 2) Resolves each listing's provider and calls its `activeTester(link)`.
 * 3) Deactivates the ones that are gone, and records the check on all of them.
 *
 * Every listing here costs one outbound HTTP request, so the run is bounded: `limit` per run and
 * only listings older than `staleAfterMs`. Without those bounds this walked every active listing
 * on every nightly run, which on a long-lived instance is close to an hour of continuous requests
 * at a handful of hosts - and a good way to get the instance's address blocked, which then breaks
 * scraping too.
 *
 * @param {object} [opts]
 * @param {number} [opts.concurrency=4] Max number of parallel activeTester calls.
 * @param {number} [opts.limit=500] Max listings probed per run.
 * @param {number} [opts.staleAfterMs] Re-probe listings not checked within this window (default 7 days).
 * @returns {Promise<void>}
 */
export default async function runActiveChecker(opts = {}) {
  const { concurrency = 4, limit = 500, staleAfterMs } = opts;

  const listings = getListingsDueForActiveCheck({
    limit,
    ...(staleAfterMs != null ? { staleAfterMs } : {}),
  });
  if (!Array.isArray(listings) || listings.length === 0) {
    logger.debug('No listings due for an active check.');
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
  /** Everything actually probed, so it is not immediately due again. */
  const probedIds = [];

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

    if (id) {
      // Recorded whatever the outcome, including a failed probe. Otherwise a listing whose
      // provider is briefly unreachable comes back as due on every run and never stops costing
      // requests.
      probedIds.push(id);
      if (result === 0) {
        listingsSetToInactive.push(id);
      }
    }
  });

  if (listingsSetToInactive.length > 0) {
    logger.info(`Setting ${listingsSetToInactive.length} listings to inactive.`);
    deactivateListings(listingsSetToInactive);
  } else {
    logger.debug('No listings need to be set inactive.');
  }

  if (probedIds.length > 0) {
    markListingsChecked(probedIds);
  }
  logger.debug(`Active check probed ${probedIds.length} of ${listings.length} due listings.`);
}
