/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { distancesToAddresses } from '../listings/distanceCalculator.js';
import {
  getListingsToCalculateDistance,
  getListingsForUserToCalculateDistance,
  updateListingDistances,
} from '../storage/listingsStorage.js';
import { getUserSettings, getAddresses } from '../storage/settingsStorage.js';

/**
 * Calculates and updates distances for listings of a specific job.
 * Only processes listings where distances is null.
 *
 * @param {string} jobId
 * @param {string} userId
 * @returns {void}
 */
export function calculateDistanceForJob(jobId, userId) {
  const addresses = getAddresses(getUserSettings(userId));
  if (addresses.length === 0) {
    return;
  }

  const listings = getListingsToCalculateDistance(jobId);
  for (const listing of listings) {
    updateListingDistances(listing.id, distancesToAddresses(listing.latitude, listing.longitude, addresses));
  }
}

/**
 * Calculates and updates distances for all active listings of a user.
 * Usually called when the user updates their addresses.
 *
 * @param {string} userId
 * @returns {void}
 */
export function calculateDistanceForUser(userId) {
  const addresses = getAddresses(getUserSettings(userId));
  if (addresses.length === 0) {
    return;
  }

  const listings = getListingsForUserToCalculateDistance(userId);
  for (const listing of listings) {
    updateListingDistances(listing.id, distancesToAddresses(listing.latitude, listing.longitude, addresses));
  }
}
