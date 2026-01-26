/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/* eslint-disable no-unused-vars */
const db = {};
export const storeListings = (jobKey, providerId, listings) => {
  if (!Array.isArray(listings)) throw Error('Not a valid array');
  db[providerId] = listings;
};
export const getKnownListingHashesForJobAndProvider = (jobKey, providerId) => {
  return db[providerId] || [];
};

export const getGeocoordinatesByAddress = (any) => {
  return null;
};

export function getUserSettings(userId) {
  return null;
}

export const updateListingDistance = (id, distance) => {
  // noop
};
/* eslint-enable no-unused-vars */
