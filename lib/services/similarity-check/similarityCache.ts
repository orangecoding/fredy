import SimilarityCacheEntry from './SimilarityCacheEntry.js';
import { config } from '../../utils.js';
//5 minutes
let retention = 5 * 60 * 1000;
const intervalInMs = config.interval * 60 * 1000;
//an interval below 5 mins sounds crazy, but there are ppl out there doing crazy shit.
if (intervalInMs <= retention) {
  retention = Math.floor(intervalInMs / 2);
}
//jobid -> SimilarityCacheEntry
const cache = {};
let intervalId;
/**
 * cleanup
 */
intervalId = setInterval(() => {
  const keysToBeRemoved = [];
  const now = Date.now();
  Object.keys(cache).forEach((key) => {
    if (cache[key].getTime() + retention < now) {
      keysToBeRemoved.push(key);
    }
  });
  if (keysToBeRemoved.length > 0) {
    keysToBeRemoved.forEach((key) => delete cache[key]);
  }
}, 10000);
export const addCacheEntry = (jobId, value) => {
  cache[jobId] = cache[jobId] || new SimilarityCacheEntry(Date.now());
  cache[jobId].setCacheEntry(value);
};
export const hasSimilarEntries = (jobId, value) => {
  if (cache[jobId] == null) {
    return false;
  }
  return cache[jobId].hasSimilarEntries(value);
};
export const stopCacheCleanup = () => {
  clearInterval(intervalId);
};
