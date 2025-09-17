import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { DEFAULT_CONFIG } from './defaultConfig.js';
import fs from 'fs';
import logger from './services/logger.js';

const RE_GT = />/g;
const RE_WEBP = /\/format\/webp/gi;
const RE_EXT = /\.(jpe?g|png|gif)(\?.*)?$/i;
const HTTPS_PREFIX = 'https://';

/**
 * Safely stringify a value to JSON for storage.
 * - Returns null when the input is null or undefined.
 * - Uses JSON.stringify directly otherwise.
 *
 * @template T
 * @param {T} v - Any JSON-serializable value.
 * @returns {string|null} JSON string or null.
 */
export const toJson = (v) => (v == null ? null : JSON.stringify(v));

/**
 * Safely parse JSON text coming from storage.
 * - Returns the provided fallback when input is null/undefined.
 * - Returns the fallback when parsing fails.
 *
 * @template T
 * @param {string|null|undefined} txt - JSON text from DB/storage.
 * @param {T} fallback - Value to return when txt is null/invalid.
 * @returns {T} Parsed value or fallback.
 */
export const fromJson = (txt, fallback) => {
  if (txt == null) return fallback;
  try {
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
};

/**
 * Determine if the current process runs in development mode.
 * Returns true when NODE_ENV is not 'production'.
 * @returns {boolean}
 */
function inDevMode() {
  return process.env.NODE_ENV == null || process.env.NODE_ENV !== 'production';
}

/**
 * Check if a word contains any of the strings in the given array (case-insensitive, substring match).
 * @param {string} word
 * @param {string[]} arr
 * @returns {boolean}
 */
function isOneOf(word, arr) {
  if (!arr || arr.length === 0 || word == null) return false;
  const lowerWord = word.toLowerCase();
  return arr.some((item) => lowerWord.indexOf(item.toLowerCase()) !== -1);
}

/**
 * Check if a value is null or an empty string/array.
 * @param {any} val
 * @returns {boolean}
 */
function nullOrEmpty(val) {
  return val == null || val.length === 0;
}

/**
 * Convert a day time string (HH:mm) to epoch milliseconds for the given reference date.
 * @param {string} timeString - Format HH:mm
 * @param {number} now - Epoch ms used as the date basis
 * @returns {number}
 */
function timeStringToMs(timeString, now) {
  const d = new Date(now);
  const parts = timeString.split(':');
  d.setHours(parts[0]);
  d.setMinutes(parts[1]);
  d.setSeconds(0);
  return d.getTime();
}

/**
 * Check whether current time is within configured working hours, or no hours are set.
 * If working hours are missing or incomplete, returns true.
 * @param {{workingHours?: {from?: string, to?: string}}} config
 * @param {number} now - Epoch ms
 * @returns {boolean}
 */
function duringWorkingHoursOrNotSet(config, now) {
  const { workingHours } = config;
  if (workingHours == null || nullOrEmpty(workingHours.from) || nullOrEmpty(workingHours.to)) {
    return true;
  }
  const toDate = timeStringToMs(workingHours.to, now);
  const fromDate = timeStringToMs(workingHours.from, now);
  return fromDate <= now && toDate >= now;
}

/**
 * Return the directory name of the current module (ESM equivalent of __dirname).
 * @returns {string}
 */
function getDirName() {
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * Build a sha256 hash string from the provided inputs (ignores null/empty strings).
 * Returns null if there are no valid inputs.
 * @param {...(string|null|undefined)} inputs
 * @returns {string|null}
 */
function buildHash(...inputs) {
  if (inputs == null) {
    return null;
  }
  const cleaned = inputs.filter((i) => i != null && i.length > 0);
  if (cleaned.length === 0) {
    return null;
  }
  return createHash('sha256').update(cleaned.join(',')).digest('hex');
}

/**
 * The in-memory configuration object. Call refreshConfig() to populate/update.
 * @type {any}
 */
let config = {};

/**
 * Read config JSON from disk (conf/config.json) and parse it.
 * @returns {Promise<any>} Parsed configuration object.
 */
export async function readConfigFromStorage() {
  return JSON.parse(await readFile(new URL('../conf/config.json', import.meta.url)));
}

/**
 * Refresh the in-memory config, ensuring the file exists and setting backward-compatible defaults.
 * Populates defaults for analyticsEnabled, demoMode, sqlitepath when missing.
 * @returns {Promise<void>}
 */
export async function refreshConfig() {
  checkIfConfigExistsAndWriteIfNot();

  try {
    config = await readConfigFromStorage();
    //backwards compatibility...
    config.analyticsEnabled ??= null;
    config.demoMode ??= false;
    // default sqlitepath when missing in older configs
    config.sqlitepath ??= '/db';
  } catch (error) {
    config = { ...DEFAULT_CONFIG };
    logger.info('Error reading config file.', error);
  }
}

/**
 * If the config file does not exist, create it with DEFAULT_CONFIG.
 * @returns {void}
 */
const checkIfConfigExistsAndWriteIfNot = () => {
  if (!fs.existsSync(`${getDirName()}/../conf/config.json`)) {
    logger.info('Could not find config file. Will create one with default values now');
    fs.writeFileSync(`${getDirName()}/../conf/config.json`, JSON.stringify({ ...DEFAULT_CONFIG }));
  }
};

/**
 * Normalize image URLs:
 * - Trim, remove stray '>' characters.
 * - Convert '/format/webp' segments to '/format/jpg'.
 * - Enforce HTTPS and ensure a valid image extension (jpg/png/gif). If URL contains '.jpg' without query, cut trailing parts.
 * - Return null for invalid inputs.
 * @param {string} url
 * @returns {string|null}
 */
const normalizeImageUrl = (url) => {
  if (typeof url !== 'string' || url.length === 0) return null;

  let u = url.trim().replace(RE_GT, '');
  if (RE_WEBP.test(u)) u = u.replace(RE_WEBP, '/format/jpg');
  if (!u.startsWith(HTTPS_PREFIX)) return null;
  if (!RE_EXT.test(u)) {
    const jpgIdx = u.toLowerCase().lastIndexOf('.jpg');
    if (jpgIdx > -1) u = u.slice(0, jpgIdx + 4);
  }
  return u;
};

await refreshConfig();

export { isOneOf };
export { normalizeImageUrl };
export { inDevMode };
export { nullOrEmpty };
export { duringWorkingHoursOrNotSet };
export { getDirName };
export { config };
export { buildHash };
export default {
  isOneOf,
  nullOrEmpty,
  duringWorkingHoursOrNotSet,
  getDirName,
  config,
  toJson,
  fromJson,
};
