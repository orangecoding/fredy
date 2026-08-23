/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getListingsToEnrichConnectivity, updateListingConnectivity } from '../storage/listingsStorage.js';
import { getSettings } from '../storage/settingsStorage.js';
import { getCountriesForProvider } from '../providers/providerCountries.js';
import { trackPoi } from '../tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import logger from '../logger.js';
import {
  getConnectivity,
  isConnectivityEnabled,
  isSourceEnabled,
  isSourcePaused,
  toColumns,
  DEFAULT_CONNECTIVITY_LIMIT_PER_RUN,
  DEFAULT_CONNECTIVITY_MAX_AGE_DAYS,
} from './connectivityService.js';
import { sourceForCountries, SOURCE_IDS } from './sources.js';

/**
 * Fills in what internet connection each listing's address has.
 *
 * There is no separate one-off backfill for instances that upgrade into this feature. The sweep
 * reads its work list from the database on every run, so a full back catalogue is simply a long
 * backlog that gets shorter each time - restartable, rate-limited, and impossible to run twice by
 * accident. That is also why it is bounded per run: a few thousand listings enriched in one burst
 * is exactly the request pattern a public register blocks.
 */

/**
 * Reads a positive integer setting, falling back when it is missing or nonsense.
 *
 * @param {any} value
 * @param {number} fallback
 * @returns {number}
 */
function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Enrich one listing.
 *
 * @param {{id: string, latitude: number, longitude: number, provider: string}} listing
 * @param {Record<string, any>} settings
 * @param {number} now
 * @returns {Promise<'enriched'|'empty'|'skipped'>} `empty` when the lookup produced nothing, which
 * is still stamped so the listing is not retried on every sweep; `skipped` when nothing was asked.
 */
async function enrichListing(listing, settings, now) {
  const countries = await getCountriesForProvider(listing.provider);
  const source = sourceForCountries(countries);

  // No register covers this country. Stamped anyway: without it every sweep would re-derive the
  // same answer for every Austrian listing an instance holds, forever.
  if (source == null) {
    updateListingConnectivity(listing.id, null, toColumns(null), now);
    return 'empty';
  }

  // A register the operator has switched off is not a register that answered "nothing here". Asked
  // before the lookup rather than after, because the lookup returns the same empty answer either
  // way, and stamping on it would put every listing in that country out of reach for the whole
  // retry interval - including after the operator switches the register back on.
  if (!isSourceEnabled(settings, source.id)) {
    return 'skipped';
  }

  // Nothing to be gained from asking a source that is standing off after a failure, and the point
  // of asking here is that the whole run then costs one failed request rather than one per
  // listing. Not stamped, so the listing comes back on the next sweep.
  if (isSourcePaused(source.id)) {
    return 'skipped';
  }

  const result = await getConnectivity(listing.latitude, listing.longitude, countries);
  const connectivity = result?.connectivity ?? null;

  // A lookup that failed rather than came back empty must not be stamped: the address is fine, the
  // service was not, and stamping would put the listing out of reach for the whole retry interval.
  if (connectivity == null && isSourcePaused(source.id)) {
    return 'skipped';
  }

  updateListingConnectivity(listing.id, connectivity, toColumns(connectivity), now);
  return connectivity == null ? 'empty' : 'enriched';
}

/**
 * Work through the listings whose connectivity is unknown or stale.
 *
 * @param {Object} [options]
 * @param {number} [options.now=Date.now()]
 * @param {number} [options.limit] - Overrides the configured ceiling.
 * @returns {Promise<{enriched: number, empty: number, skipped: number}>}
 */
export default async function runConnectivitySweep({ now = Date.now(), limit } = {}) {
  const tally = { enriched: 0, empty: 0, skipped: 0 };

  const settings = await getSettings();
  if (!(await isConnectivityEnabled(settings))) {
    return tally;
  }

  const listings = getListingsToEnrichConnectivity({
    limit: limit ?? positiveInteger(settings?.connectivityLimitPerRun, DEFAULT_CONNECTIVITY_LIMIT_PER_RUN),
    maxAgeDays: positiveInteger(settings?.connectivityMaxAgeDays, DEFAULT_CONNECTIVITY_MAX_AGE_DAYS),
    now,
  });

  if (listings.length === 0) {
    return tally;
  }

  for (const listing of listings) {
    // Checked per listing rather than once: the operator may switch the feature off while a sweep
    // with a few hundred listings in hand is still working through it.
    if (!(await isConnectivityEnabled())) {
      break;
    }
    try {
      tally[await enrichListing(listing, settings, now)] += 1;
    } catch (error) {
      logger.error(`Could not enrich connectivity for listing ${listing.id}:`, error);
      tally.skipped += 1;
    }
  }

  await reportUnavailableSources(settings, tally);

  logger.debug(
    `Connectivity sweep done: ${tally.enriched} enriched, ${tally.empty} without data, ${tally.skipped} skipped.`,
  );
  return tally;
}

/**
 * Report a register that has stopped answering.
 *
 * These are other people's services, published on their own terms and free to change or disappear.
 * The only way to learn that one has is to notice that a sweep got nothing out of it, so it is
 * counted - once per run, never once per listing, or a dead register would drown out everything
 * else the tracking says.
 *
 * @param {Record<string, any>} settings
 * @param {{enriched: number}} tally
 * @returns {Promise<void>}
 */
async function reportUnavailableSources(settings, tally) {
  // Nothing skipped means nothing was refused, whatever else the run did. Without this a sweep that
  // only had Austrian listings to stamp would report an outage on the strength of a register left
  // standing off by an earlier run.
  if (tally.skipped === 0 || tally.enriched > 0) {
    return;
  }
  for (const source of SOURCE_IDS) {
    if (isSourceEnabled(settings, source) && isSourcePaused(source)) {
      await trackPoi(TRACKING_POIS.CONNECTIVITY_SOURCE_UNAVAILABLE);
      return;
    }
  }
}
