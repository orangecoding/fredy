/**
 * Similarity cache
 *
 * Maintains an in-memory Set of content hashes to detect whether a listing
 * (identified by a tuple of title, price and address) has been seen before.
 *
 * Design notes:
 * - The cache is refreshed periodically from persistent storage. To avoid
 *   modification-during-iteration issues, the refresh builds a new Set and
 *   atomically swaps the reference instead of mutating in place.
 * - Hashing ignores null/undefined values but preserves falsy-yet-valid values
 *   like 0. Non-string values are coerced to strings before hashing.
 *
 * This module has no persistence of its own; it relies on
 * getAllEntriesFromListings() for data hydration.
 * @module similarityCache
 */
import crypto from 'crypto';
import { getAllEntriesFromListings } from '../storage/listingsStorage.js';

/** @type {number} Refresh interval in milliseconds (defaults to one hour). */
const reloadCycle = 60 * 60 * 1000; // every hour, refresh

/**
 * Internal cache of content hashes for known listings.
 *
 * Each entry is an SHA-256 hex digest produced by toHash(title, price, address).
 * @type {Set<string>}
 */
let cache = new Set();

// Periodically refresh the cache from storage
setInterval(() => {
  initSimilarityCache();
}, reloadCycle);

/**
 * Initialize or refresh the similarity cache from persistent storage.
 *
 * Reads all stored listings via getAllEntriesFromListings(), computes a hash for
 * each, and swaps the in-memory Set atomically to avoid in-place mutations that
 * could interfere with concurrent iteration.
 *
 * This function is idempotent and safe to call at any time.
 * @returns {void}
 */
export const initSimilarityCache = () => {
  const allEntries = getAllEntriesFromListings();
  const newCache = new Set();
  for (const entry of allEntries) {
    newCache.add(toHash(entry?.title, entry?.price, entry?.address));
  }
  // Atomic swap to avoid mutating the cache while it may be iterated elsewhere
  cache = newCache;
};

/**
 * Check if a listing is already known and add it to the cache if not.
 *
 * The listing is identified by the combination of its title, price and
 * address. Null/undefined fields are ignored during hashing. Falsy-but-valid
 * values (e.g., price 0) are preserved.
 *
 * @param {Object} params - Listing fields
 * @param {string|undefined|null} params.title - The listing title
 * @param {string|undefined|null} params.address - The listing address
 * @param {number|string|undefined|null} params.price - The listing price
 * @returns {boolean} true if the entry already existed in the cache (duplicate), otherwise false
 */
export const checkAndAddEntry = ({ title, address, price }) => {
  const hash = toHash(title, price, address);
  if (cache.has(hash)) {
    return true;
  }
  cache.add(hash);
  return false;
};

/**
 * Generate an SHA-256 hash from a list of input values.
 * Null or undefined values are ignored. Falsy but valid values like 0 are preserved.
 * Non-string values are coerced to strings prior to hashing.
 *
 * @param {...(string|number|null|undefined)} strings - Input values to hash
 * @returns {string} Hexadecimal hash
 */
function toHash(...strings) {
  const normalized = strings
    .filter((v) => v !== null && v !== undefined)
    .map((v) => (typeof v === 'string' ? v : String(v)));
  return crypto.createHash('sha256').update(normalized.join('|')).digest('hex');
}
