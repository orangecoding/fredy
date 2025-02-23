const db = {};
export const setKnownListings = (jobKey: any, providerId: any, listings: any) => {
  if (!Array.isArray(listings)) throw Error('Not a valid array');
  // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  db[providerId] = listings;
};
export const getKnownListings = (jobKey: any, providerId: any) => {
  // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  return db[providerId] || [];
};
