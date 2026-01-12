/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import { getListingsToGeocode, updateListingGeocoordinates } from '../storage/listingsStorage.js';
import { geocodeAddress, isGeocodingPaused } from '../geocoding/geoCodingService.js';

async function runTask() {
  const listings = getListingsToGeocode();
  if (listings.length === 0) {
    return;
  }

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

export async function initGeocodingCron() {
  // run directly on start
  await runTask();
  // then every 6 hours
  cron.schedule('0 */6 * * *', runTask);
}
