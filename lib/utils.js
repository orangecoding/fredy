/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { dirname } from 'node:path';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { DEFAULT_CONFIG } from './defaultConfig.js';
import fs, { readFileSync } from 'fs';
import logger from './services/logger.js';
import { packageUp } from 'package-up';

const RE_GT = />/g;
const RE_WEBP = /\/format\/webp/gi;
const RE_EXT = /\.(jpe?g|png|gif)(\?.*)?$/i;
const HTTPS_PREFIX = 'https://';
const providersDirectoryPath = `${getDirName()}/provider`;

/**
 * Lazily load all provider modules from the provider directory.
 * Caches the resolved array to avoid re-importing on subsequent calls.
 *
 * @returns {Promise<any[]>} A list of loaded provider modules.
 */
let cachedProvidersPromise = null;

export function getProviders() {
  if (!cachedProvidersPromise) {
    /** @type {string[]} */
    const providerFileNames = fs.readdirSync(providersDirectoryPath).filter((fileName) => fileName.endsWith('.js'));
    cachedProvidersPromise = Promise.all(
      providerFileNames.map((fileName) => import(pathToFileURL(path.join(providersDirectoryPath, fileName)).href)),
    );
  }
  return cachedProvidersPromise;
}

/**
 * Safely stringify a value to JSON for storage.
 * - Returns null when the input is null or undefined.
 * - Uses JSON.stringify directly otherwise.
 *
 * @template T
 * @param {T} v - Any JSON-serializable value.
 * @returns {string|null} JSON string or null.
 */
const toJson = (v) => (v == null ? null : JSON.stringify(v));

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
const fromJson = (txt, fallback) => {
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
 * Determine whether the given timestamp is within the configured working hours, or return true when the window is not set.
 * - If workingHours is missing or either 'from' or 'to' is empty/null, returns true.
 * - Supports windows that cross midnight (e.g., from '23:00' to '06:00').
 *
 * Time parsing is based on the local timezone of the running process.
 *
 * @param {{workingHours?: {from?: string|null, to?: string|null}}} config - Configuration object containing working hours in 'HH:mm' format.
 * @param {number} now - Epoch milliseconds to evaluate.
 * @returns {boolean} True when execution is allowed at 'now'.
 * @example
 * // Same-day window
 * duringWorkingHoursOrNotSet({ workingHours: { from: '08:00', to: '17:00' } }, someTime);
 * @example
 * // Window crossing midnight
 * // For { from: '05:00', to: '00:30' } → 23:00 => true, 01:00 => false, 06:00 => true
 * duringWorkingHoursOrNotSet({ workingHours: { from: '05:00', to: '00:30' } }, Date.now());
 */
function duringWorkingHoursOrNotSet(config, now) {
  const { workingHours } = config;
  if (workingHours == null || nullOrEmpty(workingHours.from) || nullOrEmpty(workingHours.to)) {
    return true;
  }
  const toDate = timeStringToMs(workingHours.to, now);
  const fromDate = timeStringToMs(workingHours.from, now);

  // If parsing fails (e.g., malformed time), be lenient and allow.
  if (isNaN(toDate) || isNaN(fromDate)) {
    return true;
  }

  if (toDate >= fromDate) {
    // Same-day window (e.g., 08:00 - 17:00)
    return now >= fromDate && now <= toDate;
  }

  // Window crosses midnight (e.g., 05:00 -> 00:30 next day)
  // Accept if we are after 'from' today OR before 'to' today (which represents next day's cutoff).
  return now >= fromDate || now <= toDate;
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
 * If the config exists, but cannot be accessed, we quit Fredy as something is fishy here.
 * @returns {Promise<boolean>}
 */
export async function checkIfConfigIsAccessible() {
  const path = new URL('../conf/config.json', import.meta.url);
  try {
    if (!fs.existsSync(path)) {
      return true;
    }
    fs.accessSync(path, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

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

/**
 * returns Fredy's version
 * @returns {Promise<*|string>}
 */
async function getPackageVersion() {
  try {
    const packagePath = await packageUp();
    const packageJson = readFileSync(packagePath, 'utf8');
    const json = JSON.parse(packageJson);
    return json.version;
  } catch (error) {
    logger.error('Error reading version from package.json', error);
  }
  return 'N/A';
}

/**
 * Sleep helper
 * @param {number} ms milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Return a random integer between min and max (inclusive).
 * @param {number} min - Minimum integer value.
 * @param {number} max - Maximum integer value.
 * @returns {number} A random integer N where min <= N <= max.
 */
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Extract embedded JSON from HTML by finding a variable assignment and using brace matching.
 * More robust than regex for complex nested JSON structures.
 *
 * @param {string} html - Raw HTML content
 * @param {string} variableName - The JavaScript variable name to find (e.g., '__INITIAL_STATE__', '__NEXT_DATA__')
 * @returns {Object|null} Parsed JSON object or null if not found/invalid
 *
 * @example
 * // Extract window.__INITIAL_STATE__ = {...}
 * const state = extractEmbeddedJson(html, '__INITIAL_STATE__');
 *
 * @example
 * // Extract window.__NEXT_DATA__ = {...}
 * const data = extractEmbeddedJson(html, '__NEXT_DATA__');
 */
function extractEmbeddedJson(html, variableName) {
  if (!html || typeof html !== 'string') {
    return null;
  }

  // Find the assignment pattern
  const patterns = [
    `window.${variableName}=`,
    `window.${variableName} =`,
    `window["${variableName}"]=`,
    `window["${variableName}"] =`,
  ];

  let startIndex = -1;
  for (const pattern of patterns) {
    startIndex = html.indexOf(pattern);
    if (startIndex !== -1) {
      startIndex += pattern.length;
      break;
    }
  }

  if (startIndex === -1) {
    return null;
  }

  // Skip any whitespace before the opening brace
  while (startIndex < html.length && /\s/.test(html[startIndex])) {
    startIndex++;
  }

  if (startIndex >= html.length || html[startIndex] !== '{') {
    return null;
  }

  // Use brace counting to find the end of the JSON object
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  let endIndex = -1;

  for (let i = startIndex; i < html.length; i++) {
    const char = html[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !inString) {
      inString = true;
      continue;
    }

    if (char === '"' && inString) {
      inString = false;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }
  }

  if (endIndex === -1) {
    return null;
  }

  const jsonString = html.slice(startIndex, endIndex);

  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

// Call refreshConfig() from the application entrypoint during startup to populate config.
await refreshConfig();

export {
  isOneOf,
  normalizeImageUrl,
  inDevMode,
  nullOrEmpty,
  duringWorkingHoursOrNotSet,
  getDirName,
  sleep,
  randomBetween,
  buildHash,
  getPackageVersion,
  toJson,
  fromJson,
  extractEmbeddedJson,
};
