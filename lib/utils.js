import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { DEFAULT_CONFIG } from './defaultConfig.js';

function inDevMode() {
  return process.env.NODE_ENV == null || process.env.NODE_ENV !== 'production';
}

function isOneOf(word, arr) {
  if (!arr || arr.length === 0 || word == null) return false;
  const lowerWord = word.toLowerCase();
  return arr.some((item) => lowerWord.indexOf(item.toLowerCase()) !== -1);
}

function nullOrEmpty(val) {
  return val == null || val.length === 0;
}

function timeStringToMs(timeString, now) {
  const d = new Date(now);
  const parts = timeString.split(':');
  d.setHours(parts[0]);
  d.setMinutes(parts[1]);
  d.setSeconds(0);
  return d.getTime();
}

function duringWorkingHoursOrNotSet(config, now) {
  const { workingHours } = config;
  if (workingHours == null || nullOrEmpty(workingHours.from) || nullOrEmpty(workingHours.to)) {
    return true;
  }
  const toDate = timeStringToMs(workingHours.to, now);
  const fromDate = timeStringToMs(workingHours.from, now);
  return fromDate <= now && toDate >= now;
}

function getDirName() {
  return dirname(fileURLToPath(import.meta.url));
}

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

let config = {};
export async function readConfigFromStorage() {
  return JSON.parse(await readFile(new URL('../conf/config.json', import.meta.url)));
}

export async function refreshConfig() {
  try {
    config = await readConfigFromStorage();
    //backwards compatability...
    config.analyticsEnabled ??= null;
    config.demoMode ??= false;
  } catch (error) {
    config = { ...DEFAULT_CONFIG };
    console.error('Error reading config file', error);
  }
}

const RE_GT = />/g;
const RE_WEBP = /\/format\/webp/gi;
const RE_EXT = /\.(jpe?g|png|gif)(\?.*)?$/i;
const HTTPS_PREFIX = 'https://';

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
};
