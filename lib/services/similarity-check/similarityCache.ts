import SimilarityCacheEntry from './SimilarityCacheEntry.js';
import { config } from '../../utils.js';
//5 minutes
let retention = 5 * 60 * 1000;
// @ts-expect-error TS(2339): Property 'interval' does not exist on type '{}'.
const intervalInMs = config.interval * 60 * 1000;
//an interval below 5 mins sounds crazy, but there are ppl out there doing crazy shit.
if (intervalInMs <= retention) {
  retention = Math.floor(intervalInMs / 2);
}
//jobid -> SimilarityCacheEntry
const cache = {};
let intervalId: any;
/**
 * cleanup
 */
intervalId = setInterval(() => {
  const keysToBeRemoved: any = [];
  const now = Date.now();
  Object.keys(cache).forEach((key) => {
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    if (cache[key].getTime() + retention < now) {
      keysToBeRemoved.push(key);
    }
  });
  if (keysToBeRemoved.length > 0) {
    // @ts-expect-error TS(7006): Parameter 'key' implicitly has an 'any' type.
    keysToBeRemoved.forEach((key) => delete cache[key]);
  }
}, 10000);
export const addCacheEntry = (jobId: any, value: any) => {
  // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  cache[jobId] = cache[jobId] || new SimilarityCacheEntry(Date.now());
  // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  cache[jobId].setCacheEntry(value);
};
export const hasSimilarEntries = (jobId: any, value: any) => {
  // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  if (cache[jobId] == null) {
    return false;
  }
  // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
  return cache[jobId].hasSimilarEntries(value);
};
export const stopCacheCleanup = () => {
  clearInterval(intervalId);
};
