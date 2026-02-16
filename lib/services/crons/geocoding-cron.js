/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import { getListingsToGeocode, updateListingGeocoordinates } from '../storage/listingsStorage.js';
import { geocodeAddress, isGeocodingPaused } from '../geocoding/geoCodingService.js';
import { getJobs } from '../storage/jobStorage.js';
import { calculateDistanceForJob } from '../geocoding/distanceService.js';
import { getSettings } from '../storage/settingsStorage.js';
import logger from '../logger.js';

export async function runGeoCordTask() {
  const listings = getListingsToGeocode();
  if (listings.length > 0) {
    for (const listing of listings) {
      if (isGeocodingPaused()) {
        break;
      }

      const coords = await geocodeAddress(listing.address);
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
}

export async function initGeocodingCron() {
  const settings = await getSettings();
  if (settings.demoMode) {
    logger.info('Do not start geo service as we are in demo mode');
    return;
  }
  // run directly on start
  await runGeoCordTask();
  // then every 6 hours
  cron.schedule('0 */6 * * *', runGeoCordTask);
}
