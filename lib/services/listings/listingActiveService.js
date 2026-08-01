/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  deactivateListings,
  getListingsDueForActiveCheck,
  markListingsChecked,
  recordActiveCheckFailures,
} from '../storage/listingsStorage.js';
import { getProviders, mapLimit } from '../../utils.js';
import logger from '../../services/logger.js';

/**
 * Runs the active-listing checker:
 * 1) Loads the listings that are due for a probe (never checked, or checked long enough ago).
 * 2) Resolves each listing's provider and calls its `activityProbe(link)`.
 * 3) Deactivates the ones that are gone, and records the check on all of them.
 * 4) Counts probes that never answered, and deactivates a listing once its failure streak reaches
 *    ACTIVE_CHECK_FAILURE_LIMIT - an IP block or a dropped connection otherwise leaves a listing
 *    active forever, which is how stale rows accumulate.
 *
 * Every listing here costs one outbound HTTP request, so the run is bounded: `limit` per run and
 * only listings older than `staleAfterMs`. Without those bounds this walked every active listing
 * on every nightly run, which on a long-lived instance is close to an hour of continuous requests
 * at a handful of hosts - and a good way to get the instance's address blocked, which then breaks
 * scraping too.
 *
 * @param {object} [opts]
 * @param {number} [opts.concurrency=4] Max number of parallel activityProbe calls.
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

  /** @type {string[]} */
  const listingsSetToInactive = [];
  /** Everything the probe gave a definitive answer for, so it is not immediately due again. */
  const probedIds = [];
  /** Probes that errored out. Counted rather than ignored, see step 4 above. */
  const failedIds = [];

  await mapLimit(listings, concurrency, async (listing) => {
    const { provider: listingProviderId, link, id } = listing || {};

    const matchedProvider = providerById[listingProviderId];
    if (!matchedProvider) {
      logger.warn('Could not find matching provider for', listingProviderId);
      return;
    }
    // `activeTester` is the pre-price-tracking name for the same thing. Still accepted so a
    // provider that was not migrated - including one carried over from a fork - keeps working.
    const tester = matchedProvider?.config?.activityProbe ?? matchedProvider?.config?.activeTester;
    if (typeof tester !== 'function') {
      logger.warn('No activityProbe configured for', listingProviderId);
      return;
    }

    // Contract: activityProbe(link) returns 1 if active, 0 if inactive
    let result;
    try {
      result = await tester(link);
    } catch {
      result = -1;
    }

    if (id) {
      // A failed probe is recorded too, just on its own path. Otherwise a listing whose provider is
      // briefly unreachable comes back as due on every run and never stops costing requests.
      if (result === -1) {
        failedIds.push(id);
        return;
      }
      probedIds.push(id);
      if (result === 0) {
        listingsSetToInactive.push(id);
      }
    }
  });

  if (failedIds.length > 0) {
    const exhausted = recordActiveCheckFailures(failedIds);
    if (exhausted.length > 0) {
      logger.info(`${exhausted.length} listings failed their probe too often. Treating them as gone.`);
      listingsSetToInactive.push(...exhausted);
    }
  }

  if (listingsSetToInactive.length > 0) {
    logger.info(`Setting ${listingsSetToInactive.length} listings to inactive.`);
    deactivateListings(listingsSetToInactive);
  } else {
    logger.debug('No listings need to be set inactive.');
  }

  if (probedIds.length > 0) {
    markListingsChecked(probedIds);
  }
  logger.debug(
    `Active check probed ${probedIds.length + failedIds.length} of ${listings.length} due listings, ${failedIds.length} without an answer.`,
  );
}
