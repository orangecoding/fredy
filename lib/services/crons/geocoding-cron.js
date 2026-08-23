/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import { getListingsToGeocode, updateListingGeocoordinates } from '../storage/listingsStorage.js';
import { geocodeAddress, isGeocodingPaused } from '../geocoding/geoCodingService.js';
import { getCountriesForProvider } from '../providers/providerCountries.js';
import { getJobs } from '../storage/jobStorage.js';
import { calculateDistanceForJob } from '../geocoding/distanceService.js';
import logger from '../logger.js';

/**
 * Guards against overlapping sweeps.
 *
 * The 6-hourly cron is not the only trigger: saving a home address kicks off a sweep too, and does
 * not await it. Two sweeps running at once do the same work twice and burn through the shared
 * Nominatim rate limit against each other, which then stalls both.
 * @type {boolean}
 */
let sweepRunning = false;

/**
 * Geocode every listing that still lacks coordinates, then refresh the per-job distances.
 *
 * A no-op while another sweep is in flight - the running one will pick up anything this call would
 * have processed, because it reads the work list from the database as it goes.
 *
 * @returns {Promise<boolean>} True when this call did the work, false when it was skipped.
 */
export async function runGeoCordTask() {
  if (sweepRunning) {
    logger.debug('Geocoding sweep already running. Skipping this trigger.');
    return false;
  }
  sweepRunning = true;
  try {
    const listings = getListingsToGeocode();
    if (listings.length > 0) {
      for (const listing of listings) {
        if (isGeocodingPaused()) {
          break;
        }

        const coords = await geocodeAddress(listing.address, await getCountriesForProvider(listing.provider));
        if (coords) {
          updateListingGeocoordinates(listing.id, coords.lat, coords.lng);
        }
      }
    }

    //additional run
    const jobs = getJobs();
    for (const job of jobs) {
      calculateDistanceForJob(job.id, job.userId);
    }

    return true;
  } finally {
    sweepRunning = false;
  }
}

export async function initGeocodingCron() {
  // run directly on start
  await runGeoCordTask();
  // then every 6 hours
  cron.schedule('0 */6 * * *', runGeoCordTask);
}
