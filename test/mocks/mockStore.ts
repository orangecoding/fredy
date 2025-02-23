const db: Record<string, string[]> = {};
export const setKnownListings = (jobKey: string, providerId: string, listings: string[]) => {
  if (!Array.isArray(listings)) throw Error('Not a valid array');
  db[providerId] = listings;
};
export const getKnownListings = (jobKey: string, providerId: string) => {
  return db[providerId] || [];
};
