const db = {};

exports.setKnownListings = (jobKey, providerId, listings) => {
  if (!Array.isArray(listings)) throw Error('Not a valid array');

  db[providerId] = listings;
};

exports.getKnownListings = (jobKey, providerId) => {
  return db[providerId] || [];
};
