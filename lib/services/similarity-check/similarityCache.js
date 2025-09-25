import crypto from 'crypto';

const retention = 60 * 60 * 1000;
/**
 * Internal cache storage.
 * Maps a SHA-256 hash (string) to its expiry timestamp (number in ms).
 * @type {Map<string, number>}
 */
const entries = new Map();

/**
 * Reference to the currently scheduled cleanup timer.
 * @type {NodeJS.Timeout | null}
 */
let timer = null;

/**
 * Generate a SHA-256 hash from a list of input strings.
 * Null or undefined values are ignored.
 *
 * @param {...(string|null|undefined)} strings - Input values to hash
 * @returns {string} Hexadecimal hash
 */
function toHash(...strings) {
  return crypto.createHash('sha256').update(strings.filter(Boolean).join('|')).digest('hex');
}

/**
 * Cleanup expired cache entries and schedule the next cleanup run.
 * This function is invoked automatically by scheduled timers.
 *
 * @private
 */
function runCleanup() {
  const now = Date.now();
  for (const [hash, expiry] of entries) {
    if (expiry <= now) entries.delete(hash);
  }
  scheduleNext();
}

/**
 * Find the soonest expiry timestamp among all cache entries
 * and schedule a one-shot timer that will trigger at that time.
 * Cancels any existing timer before scheduling a new one.
 *
 * @private
 */
function scheduleNext() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  let next = Infinity;
  const now = Date.now();
  for (const expiry of entries.values()) {
    if (expiry > now && expiry < next) next = expiry;
  }
  if (next !== Infinity) {
    timer = setTimeout(runCleanup, Math.max(0, next - now));
  }
}

/**
 * Add or refresh a cache entry for the given title and address.
 * The entry will automatically expire after the configured retention window.
 *
 * @param {string} title - The title used to build the cache key
 * @param {string} address - The address used to build the cache key
 */
export function addCacheEntry(title, address) {
  const hash = toHash(title, address);
  const expiry = Date.now() + retention;
  entries.set(hash, expiry);
  scheduleNext();
}

/**
 * Check if a cache entry with the same title and address exists
 * and is still valid (not expired).
 *
 * @param {string} title - The title used to build the cache key
 * @param {string} address - The address used to build the cache key
 * @returns {boolean} True if a valid cache entry exists, false otherwise
 */
export function hasSimilarEntries(title, address) {
  const hash = toHash(title, address);
  const expiry = entries.get(hash);
  if (expiry == null) return false;
  if (expiry <= Date.now()) {
    entries.delete(hash);
    scheduleNext();
    return false;
  }
  return true;
}

/**
 * Stop any scheduled cleanup timers and prevent further automatic cleanup.
 * Entries that are already in the cache will remain until removed manually
 * or until cleanup is started again by adding new entries.
 */
export function stopCacheCleanup() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/**
 * this is only for test purposes
 */
export function invalidateAllForTest() {
  for (const key of entries.keys()) {
    entries.set(key, 0);
  }
  runCleanup();
}
