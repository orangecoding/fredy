import SimilarityCacheEntry from './SimilarityCacheEntry';
import { config } from '../../utils';

export interface SimilarityCache {
  addCacheEntry: (jobId: string, listingTitle: string) => void;
  hasSimilarEntries: (jobId: string, listingTitle: string) => boolean;
  stopCacheCleanup: () => void;
}

//5 minutes
let retention = 5 * 60 * 1000;
const intervalInMs = config.interval! * 60 * 1000;

//an interval below 5 mins sounds crazy, but there are ppl out there doing crazy shit.
if (intervalInMs <= retention) {
  retention = Math.floor(intervalInMs / 2);
}

//jobId -> SimilarityCacheEntry
const cache: { [key: string]: SimilarityCacheEntry } = {};

/**
 * Cleans up expired cache entries based on the retention period
 * Runs every 10 seconds to ensure timely cleanup of expired entries
 */
const intervalId = setInterval(() => {
  try {
    Object.entries(cache)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .filter(([_, entry]) => entry.getTime() + retention < Date.now())
      .map(([key]) => key)
      .forEach((key) => delete cache[key]);
  } catch (error) {
    console.error('Error during cache cleanup:', error);
  }
}, 10000);

export const addCacheEntry = (jobId: string, listingTitle: string) => {
  cache[jobId] = cache[jobId] || new SimilarityCacheEntry(Date.now());
  cache[jobId].setCacheEntry(listingTitle);
};

export const hasSimilarEntries = (jobId: string, listingTitle: string) => {
  if (cache[jobId] == null) {
    return false;
  }
  return cache[jobId].hasSimilarEntries(listingTitle);
};

export const stopCacheCleanup = () => {
  clearInterval(intervalId);
};
