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

let userSettings = null;
export function setUserSettings(settings) {
  userSettings = settings;
}
export function getUserSettings(userId) {
  return userSettings;
}

export async function getSettings() {
  return { baseUrl: '' };
}

export const updateListingDistance = (id, distance) => {
  // noop
};
export const deletedIds = [];
export const deleteListingsById = (ids) => {
  deletedIds.push(...ids);
};
export const deleteListingsByHash = (hashes) => {
  deletedIds.push(...hashes);
};
/* eslint-enable no-unused-vars */
