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
import { DEFAULT_HOST_GAP_MS, createHostPacer } from './hostPacer.js';
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
 * Every listing here costs one outbound HTTP request, so the run is bounded three ways: `limit` per
 * run, only listings older than `staleAfterMs`, and never more than one request at a time at any one
 * host. Without the first two this walked every active listing on every nightly run, which on a
 * long-lived instance is close to an hour of continuous requests at a handful of hosts - and a good
 * way to get the instance's address blocked, which then breaks scraping too.
 *
 * The third bound is why `concurrency` alone is not enough. Listings come out of the database
 * ordered by age, not by portal, so the parallel probes are regularly all pointed at the same host;
 * that put eight requests inside one second at immobilienscout24.de and got HTTP 429 back for most
 * of them. `hostPacer` keeps the concurrency across portals and leaves each portal a queue of one.
 *
 * @param {object} [opts]
 * @param {number} [opts.concurrency=4] Max number of parallel activityProbe calls, across all hosts.
 * @param {number} [opts.limit=500] Max listings probed per run.
 * @param {number} [opts.staleAfterMs] Re-probe listings not checked within this window (default 7 days).
 * @param {number} [opts.hostGapMs] Floor on the time between two probes at one host (default 350ms).
 * @returns {Promise<void>}
 */
export default async function runActiveChecker(opts = {}) {
  const { concurrency = 4, limit = 500, staleAfterMs, hostGapMs = DEFAULT_HOST_GAP_MS } = opts;

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

  const pace = createHostPacer({ minGapMs: hostGapMs });

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

    // Contract: activityProbe(link) returns 1 if active, 0 if inactive, -1 if it got no answer.
    // The probe runs through the pacer, so the portal sees a queue rather than a burst.
    let result;
    try {
      result = await pace(link, () => tester(link));
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
