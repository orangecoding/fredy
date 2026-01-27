/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { distanceMeters } from '../listings/distanceCalculator.js';
import {
  getListingsToCalculateDistance,
  getListingsForUserToCalculateDistance,
  updateListingDistance,
} from '../storage/listingsStorage.js';
import { getUserSettings } from '../storage/settingsStorage.js';

/**
 * Calculates and updates distances for listings of a specific job.
 * Only processes listings where distance_to_destination is null.
 *
 * @param {string} jobId
 * @param {string} userId
 * @returns {void}
 */
export function calculateDistanceForJob(jobId, userId) {
  const userSettings = getUserSettings(userId);
  const homeAddress = userSettings?.home_address;

  if (!homeAddress?.coords) {
    return;
  }

  const listings = getListingsToCalculateDistance(jobId);
  const { lat, lng } = homeAddress.coords;

  for (const listing of listings) {
    const dist = distanceMeters(lat, lng, listing.latitude, listing.longitude);
    updateListingDistance(listing.id, dist);
  }
}

/**
 * Calculates and updates distances for all active listings of a user.
 * Usually called when the user updates their home address.
 *
 * @param {string} userId
 * @returns {void}
 */
export function calculateDistanceForUser(userId) {
  const userSettings = getUserSettings(userId);
  const homeAddress = userSettings?.home_address;

  if (!homeAddress?.coords) {
    return;
  }

  const listings = getListingsForUserToCalculateDistance(userId);
  const { lat, lng } = homeAddress.coords;

  for (const listing of listings) {
    const dist = distanceMeters(lat, lng, listing.latitude, listing.longitude);
    updateListingDistance(listing.id, dist);
  }
}
