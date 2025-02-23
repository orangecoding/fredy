import { Listing } from '#types/Listings.ts';

let tmpStore: { serviceName: string; payload: Listing[] } = { serviceName: '', payload: [] };

export const send = (serviceName: string, payload: Listing[]) => {
  tmpStore = { serviceName, payload };
  return [Promise.resolve()];
};

export const get = () => {
  return tmpStore;
};
