/**
 * each job that runs scrapes all provider. This cache holds the titles of the found listing(s) and provides
 * a similarity check. if this check returns true, it will not be forwarded to the notification adapter, thus
 * the user won't see any duplicates
 *
 * The retention of this cache is per default 5 minutes, but can be smaller if the interval is > 5 mins.
 *
 * @type {module.SimilarityCacheEntry|{}}
 */
const SimilarityCacheEntry = require('./SimilarityCacheEntry');
const config = require('../../../../conf/config.json');

//5 minutes
let retention = 5 * 60 * 1000;

const intervalInMs = config.interval * 60 * 1000;
//an interval below 5 mins sounds crazy, but there are ppl out there doing crazy shit.
if (intervalInMs <= retention) {
  retention = Math.floor(intervalInMs / 2);
}

//jobid -> SimilarityCacheEntry
const cache = {};

exports.addCacheEntry = (jobId, value) => {
  cache[jobId] = cache[jobId] || new SimilarityCacheEntry(Date.now());
  cache[jobId].setCacheEntry(value);
};

exports.hasSimilarEntries = (jobId, value) => {
  if (cache[jobId] == null) {
    return false;
  }

  return cache[jobId].hasSimilarEntries(value);
};

/**
 * cleanup
 */
setInterval(() => {
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
