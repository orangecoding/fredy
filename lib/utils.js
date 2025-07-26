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
await refreshConfig();

export { isOneOf };
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
