/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { distancesToAddresses } from '../listings/distanceCalculator.js';
import {
  getListingsToCalculateDistance,
  getListingsForUserToCalculateDistance,
  markTravelTimesDirty,
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
 * Recomputes the stored distances of all active geocoded listings of a user after the
 * user's address list changed. Uses the already stored listing coordinates, so no
 * geocoding happens; only the (cheap) straight-line distances are recomputed.
 *
 * @param {string} userId
 * @param {import('../../types/listing.js').Address[]} addresses - The user's current address list.
 * @returns {number} How many listings were put back in front of the travel-time sweeper.
 */
export function updateDistancesForAddressChange(userId, addresses) {
  const listings = getListingsForUserToCalculateDistance(userId);
  for (const listing of listings) {
    updateListingDistances(listing.id, distancesToAddresses(listing.latitude, listing.longitude, addresses));
  }

  // Travel times cannot be recomputed here - they need the network - so the listings are only put
  // back in front of the sweeper. Marking rather than deleting is what keeps this cheap: the sweeper
  // compares each stored journey against the addresses as they are now, so adding a third address
  // costs requests for that address alone, and renaming one costs nothing at all.
  markTravelTimesDirty(listings.map((listing) => listing.id));

  // Handed back so the form can say how much work it just queued. The sweeper is a trickle by
  // design, so "Saved" on its own understates what happens next by several hours.
  return listings.length;
}

/**
 * Recompute the stored distances of a single listing whose coordinates just changed.
 *
 * The reference addresses are the job owner's, not the caller's: a job can be shared, and the
 * distances belong to whoever's search this is - the same choice the scraping pipeline makes.
 *
 * With no addresses configured the distances are left as they are (NULL after a manual address
 * change), so a later sweep can still fill them in once the user has some.
 *
 * @param {string} listingId
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} ownerUserId - The user the job belongs to.
 * @returns {void}
 */
export function updateDistancesForListing(listingId, latitude, longitude, ownerUserId) {
  const addresses = getAddresses(getUserSettings(ownerUserId));
  if (addresses.length === 0) {
    return;
  }

  updateListingDistances(listingId, distancesToAddresses(latitude, longitude, addresses));
}
