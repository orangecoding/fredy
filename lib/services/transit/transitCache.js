/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The read-through cache every Transitous lookup shares.
 *
 * It used to live inside `transitService.js`, which was fine while stops and departures were the
 * only callers. Journey planning is the reason it moved: routing is by far the most expensive thing
 * the upstream community service does for us, so it must sit behind the same cache and the same
 * in-flight deduplication rather than behind a second copy of them that ages independently.
 */

/** @type {Map<string, {expiresAt: number, value: unknown}>} */
const cache = new Map();

/** @type {Map<string, Promise<unknown>>} */
const inFlight = new Map();

/**
 * A failed lookup is cached too, briefly: it keeps a broken upstream from being hammered by every
 * popup, without a transient error hiding the result for a whole day.
 */
export const FAILURE_TTL = 60 * 1000;

/**
 * Coordinates are rounded to five decimals (about a metre) for cache keys. Two clicks on the same
 * marker must hit the same entry; two different stops must not.
 */
export const COORD_PRECISION = 5;

/**
 * Rounds a coordinate to the precision used in cache keys.
 *
 * @param {number} value
 * @returns {number}
 */
export function roundCoord(value) {
  return Number(value.toFixed(COORD_PRECISION));
}

/**
 * How many entries may sit in the cache before expired ones are swept out.
 *
 * Entries are otherwise only dropped when someone asks for that exact key again, which is fine for
 * departure boards - the map asks for the same stops over and over - but not for journeys: a batch
 * run touches hundreds of coordinate pairs it will never look up a second time, and the reference
 * departure moves every week, so those keys would accumulate forever.
 */
const PRUNE_THRESHOLD = 2000;

/**
 * Drops every entry whose lifetime has run out.
 *
 * @returns {void}
 */
function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

/**
 * Reads through the cache, collapsing concurrent misses of the same key into one upstream call.
 *
 * @template T
 * @param {string} key
 * @param {(value: T) => number} ttlFor - Lifetime in milliseconds for the value that was loaded.
 * @param {() => Promise<T>} loader
 * @returns {Promise<T>}
 */
export async function cached(key, ttlFor, loader) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return /** @type {T} */ (hit.value);
  }
  // An expired entry is dead weight from here on: either the reload replaces it or it is gone.
  cache.delete(key);

  const running = inFlight.get(key);
  if (running) {
    return /** @type {Promise<T>} */ (running);
  }

  const promise = (async () => {
    const value = await loader();
    if (cache.size >= PRUNE_THRESHOLD) {
      pruneExpired();
    }
    cache.set(key, { expiresAt: Date.now() + ttlFor(value), value });
    return value;
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Drops every cached lookup. Only used by the tests, which would otherwise leak state between
 * cases.
 *
 * @returns {void}
 */
export function clearTransitCache() {
  cache.clear();
  inFlight.clear();
}
