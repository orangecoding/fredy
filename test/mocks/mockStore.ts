const db = {};
export const setKnownListings = (jobKey, providerId, listings) => {
  if (!Array.isArray(listings)) throw Error('Not a valid array');
  db[providerId] = listings;
};
export const getKnownListings = (jobKey, providerId) => {
  return db[providerId] || [];
};
