import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { DEFAULT_CONFIG } from './defaultConfig';
import { GeneralSettings } from '#types/GeneralSettings.js';

function inDevMode() {
  return process.env['NODE_ENV'] == null || process.env['NODE_ENV'] !== 'production';
}

function isOneOf(word: string | null | undefined, arr: string[]) {
  if (arr == null || arr.length === 0) {
    return false;
  }
  const expression = String.raw`\b(${arr.join('|')})\b`;
  const blacklist = new RegExp(expression, 'ig');
  return blacklist.test(String(word));
}

function timeStringToMs(timeString: string, now: number) {
  const d = new Date(now);
  const parts: string[] = timeString.split(':');
  d.setHours(parts[0] ? parseInt(parts[0], 10) : 0);
  d.setMinutes(parts[1] ? parseInt(parts[1], 10) : 0);
  d.setSeconds(0);
  return d.getTime();
}

function duringWorkingHoursOrNotSet(config: Pick<GeneralSettings, 'workingHours'>, now: number) {
  const { workingHours } = config;
  if (workingHours == null || !workingHours.from || !workingHours.to) {
    return true;
  }
  const toDate = timeStringToMs(workingHours.to, now);
  const fromDate = timeStringToMs(workingHours.from, now);
  return fromDate <= now && toDate >= now;
}

function getDirName() {
  return dirname(fileURLToPath(import.meta.url));
}

function buildHash(...inputs: (string | number | null | undefined)[]) {
  if (inputs == null) {
    return null;
  }
  const cleaned = inputs.filter((i) => typeof i === 'string' && i.length > 0);
  if (cleaned.length === 0) {
    return null;
  }
  return createHash('sha256').update(cleaned.join(',')).digest('hex');
}

let config: GeneralSettings = DEFAULT_CONFIG;
export async function readConfigFromStorage(): Promise<GeneralSettings> {
  const fileContent = await readFile(new URL('../conf/config.json', import.meta.url));
  return JSON.parse(fileContent.toString());
}

export async function refreshConfig() {
  try {
    config = await readConfigFromStorage();
  } catch (error) {
    config = { ...DEFAULT_CONFIG };
    console.error('Error reading config file', error);
  }
}
await refreshConfig();

export { isOneOf };
export { inDevMode };
export { duringWorkingHoursOrNotSet };
export { getDirName };
export { config };
export { buildHash };
export default {
  isOneOf,
  duringWorkingHoursOrNotSet,
  getDirName,
  config,
};
