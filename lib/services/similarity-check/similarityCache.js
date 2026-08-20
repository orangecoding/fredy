/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Similarity cache
 *
 * Decides whether a listing the pipeline just found is one Fredy already knows, so the same flat
 * advertised on ImmoScout, Immowelt and Kleinanzeigen reaches the user once instead of three times.
 *
 * Two tiers answer that question:
 *
 * 1. **Exact.** A SHA-256 over `jobId|title|price|address`. This is the same hash the cache has
 *    always used and it still earns its place: it is the cheap answer for a listing the same
 *    provider re-advertises unchanged, and it is the only tier that works when a listing carries no
 *    size or room count.
 * 2. **Fingerprint.** For everything the exact tier misses, {@link module:listingFingerprint} pins
 *    the listing to the signals that actually survive being republished on another portal - living
 *    space, rooms, and where it is - and compares it against the listings already known for the
 *    same job. This is the tier that makes cross-provider dedup work at all: no two portals write
 *    the same headline, format the address the same way, or even mean the same thing by "price",
 *    so an exact hash across providers essentially never collided.
 *
 * Design notes:
 * - The cache is refreshed periodically from persistent storage. To avoid modification-during-
 *   iteration issues, the refresh builds new structures and atomically swaps the references
 *   instead of mutating in place.
 * - Fingerprint comparison is bucketed by job, room count and rounded size, so a lookup only ever
 *   scans the handful of listings that could plausibly match rather than the whole cache.
 *
 * This module has no persistence of its own; it relies on getAllEntriesFromListings() for data
 * hydration.
 * @module similarityCache
 */
import crypto from 'crypto';
import { getAllEntriesFromListings } from '../storage/listingsStorage.js';
import { buildFingerprint, candidateBlockKeys, isLikelyDuplicate, stripAddressSuffix } from './listingFingerprint.js';

/** @type {number} Refresh interval in milliseconds (defaults to one hour). */
const reloadCycle = 60 * 60 * 1000; // every hour, refresh

/**
 * How many listings a single bucket keeps. Buckets are narrow (one job, one room count, one square
 * metre), so this is only ever reached by a job watching a large new-build development, where the
 * oldest entries are also the least likely to still be advertised.
 * @type {number}
 */
const MAX_BUCKET_SIZE = 200;

/**
 * Content hashes of known listings, mapped to how many stored listings produced them.
 *
 * The count is what makes {@link removeEntry} safe: two different listings can hash the same when
 * they share title, price and address, and dropping the hash on the first removal would let the
 * survivor be re-notified.
 * @type {Map<string, number>}
 */
let exactHashes = new Map();

/**
 * Fingerprints of known listings, bucketed by `jobId|rooms|size`.
 * @type {Map<string, import('./listingFingerprint.js').Fingerprint[]>}
 */
let buckets = new Map();

export const startSimilarityCacheReloader = () => {
  // Periodically refresh the cache from storage
  setInterval(() => {
    initSimilarityCache();
  }, reloadCycle);
};

/**
 * Initialize or refresh the similarity cache from persistent storage.
 *
 * Reads all stored listings via getAllEntriesFromListings(), rebuilds both tiers, and swaps the
 * in-memory structures atomically to avoid in-place mutations that could interfere with concurrent
 * iteration.
 *
 * This function is idempotent and safe to call at any time.
 * @returns {void}
 */
export const initSimilarityCache = () => {
  const allEntries = getAllEntriesFromListings();
  const newHashes = new Map();
  const newBuckets = new Map();

  for (const entry of allEntries) {
    const record = toRecord(entry);
    const hash = toHash(record.jobId, record.title, record.price, record.address);
    newHashes.set(hash, (newHashes.get(hash) ?? 0) + 1);
    addToBuckets(newBuckets, buildFingerprint(record), hash);
  }

  // Atomic swap to avoid mutating the cache while it may be iterated elsewhere
  exactHashes = newHashes;
  buckets = newBuckets;
};

/**
 * Map a stored listings row onto the record shape the cache works with.
 *
 * @param {Object} row Row as returned by getAllEntriesFromListings().
 * @returns {import('./listingFingerprint.js').SimilarityRecord}
 */
function toRecord(row) {
  return {
    jobId: row?.job_id,
    provider: row?.provider,
    title: row?.title,
    address: row?.address,
    price: row?.price,
    size: row?.size,
    rooms: row?.rooms,
    description: row?.description,
  };
}

/**
 * File a fingerprint under every bucket it belongs to.
 *
 * @param {Map<string, import('./listingFingerprint.js').Fingerprint[]>} target Bucket map to write to.
 * @param {import('./listingFingerprint.js').Fingerprint} fingerprint
 * @param {string} hash The listing's exact content hash, used to find it again on removal.
 * @returns {void}
 */
function addToBuckets(target, fingerprint, hash) {
  if (fingerprint.blockKey == null) return;
  const bucket = target.get(fingerprint.blockKey);
  const stored = { ...fingerprint, hash };
  if (bucket == null) {
    target.set(fingerprint.blockKey, [stored]);
    return;
  }
  bucket.push(stored);
  if (bucket.length > MAX_BUCKET_SIZE) bucket.shift();
}

/**
 * Check if a listing is already known and add it to the cache if not.
 *
 * A listing counts as known when its exact content hash is already cached, or when it looks like
 * the same flat as a listing another provider contributed to this job - see
 * {@link module:listingFingerprint.isLikelyDuplicate} for what "looks like" means. Duplicates are
 * not added, so the first copy stays the one the cache knows about.
 *
 * Null/undefined fields are ignored during hashing. Falsy-but-valid values (e.g., price 0) are
 * preserved. Listings without a size or room count can only be caught by the exact tier.
 *
 * @param {import('./listingFingerprint.js').SimilarityRecord} record - Listing fields.
 * @returns {boolean} true if the entry was already known (duplicate), otherwise false
 */
export const checkAndAddEntry = (record) => {
  const { jobId, title, address, price } = record ?? {};
  const hash = toHash(jobId, title, price, address);
  if (exactHashes.has(hash)) {
    return true;
  }

  const fingerprint = buildFingerprint(record ?? {});
  for (const key of candidateBlockKeys(fingerprint)) {
    const bucket = buckets.get(key);
    if (bucket == null) continue;
    for (const known of bucket) {
      if (isLikelyDuplicate(fingerprint, known)) return true;
    }
  }

  exactHashes.set(hash, 1);
  addToBuckets(buckets, fingerprint, hash);
  return false;
};

/**
 * Remove an entry from the similarity cache.
 *
 * Must be called when a listing is permanently (hard) deleted. The on-disk row is gone, but without
 * evicting it here the in-memory cache stays stale until the next hourly reload (or a restart).
 * That staleness causes the "hard-deleted listings vanish" bug: the next scan re-discovers the
 * listing (its hash is no longer in the DB, so it counts as new and gets re-inserted), but
 * {@link checkAndAddEntry} still recognises it and the pipeline immediately soft-deletes the
 * freshly inserted row.
 *
 * Entries that share a content hash are counted rather than overwritten, so removing one leaves the
 * others intact.
 *
 * Uses the same hashing rules as {@link checkAndAddEntry} (null/undefined ignored, falsy-but-valid
 * values like 0 preserved).
 *
 * @param {import('./listingFingerprint.js').SimilarityRecord} record - Fields identifying the entry to evict.
 * @returns {boolean} true if an entry was removed, false if it was not present.
 */
export const removeEntry = (record) => {
  const { jobId, title, address, price } = record ?? {};
  const hash = toHash(jobId, title, price, address);
  const count = exactHashes.get(hash);
  if (count == null) return false;

  if (count > 1) {
    exactHashes.set(hash, count - 1);
  } else {
    exactHashes.delete(hash);
  }

  const fingerprint = buildFingerprint(record ?? {});
  if (fingerprint.blockKey != null) {
    const bucket = buckets.get(fingerprint.blockKey);
    const index = bucket?.findIndex((known) => known.hash === hash) ?? -1;
    if (index >= 0) {
      bucket.splice(index, 1);
      if (bucket.length === 0) buckets.delete(fingerprint.blockKey);
    }
  }

  return true;
};

/**
 * Generate an SHA-256 hash from a listing's exact-match fields.
 * Parenthesized address suffixes are removed to match persisted listing data.
 * Null or undefined values are ignored. Falsy but valid values like 0 are preserved.
 *
 * @param {string|null|undefined} jobId
 * @param {string|null|undefined} title
 * @param {number|string|null|undefined} price
 * @param {string|null|undefined} address
 * @returns {string} Hexadecimal hash
 */
function toHash(jobId, title, price, address) {
  const normalized = [jobId, title, price, stripAddressSuffix(address)]
    .filter((v) => v !== null && v !== undefined)
    .map((v) => (typeof v === 'string' ? v : String(v)));
  return crypto.createHash('sha256').update(normalized.join('|')).digest('hex');
}
