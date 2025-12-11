/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

const db = {};
export const storeListings = (jobKey, providerId, listings) => {
  if (!Array.isArray(listings)) throw Error('Not a valid array');
  db[providerId] = listings;
};
export const getKnownListingHashesForJobAndProvider = (jobKey, providerId) => {
  return db[providerId] || [];
};
