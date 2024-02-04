import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'fs/promises';

export const isOneOf = (word: string, arr: string[]): boolean => {
  if (arr == null || arr.length === 0) {
    return false;
  }
  const expression = String.raw`\b(${arr.join('|')})\b`;
  const blacklist = new RegExp(expression, 'ig');
  return blacklist.test(word);
};
export const nullOrEmpty = (val: string): boolean => {
  return val == null || val.length === 0;
};
const timeStringToMs = (timeString: string, now: number): number => {
  const d = new Date(now);
  const parts = timeString.split(':');
  d.setHours(parseInt(parts[0]));
  d.setMinutes(parseInt(parts[1]));
  d.setSeconds(0);
  return d.getTime();
};

export const duringWorkingHoursOrNotSet = (config: Config, now: number) => {
  const { workingHours } = config;
  if (workingHours == null || nullOrEmpty(workingHours.from) || nullOrEmpty(workingHours.to)) {
    return true;
  }
  const toDate = timeStringToMs(workingHours.to, now);
  const fromDate = timeStringToMs(workingHours.from, now);
  return fromDate <= now && toDate >= now;
};

export const getDirName = () => {
  return dirname(fileURLToPath(import.meta.url));
};

const url = new URL('../conf/config.json', import.meta.url);
const fileContents = await readFile(url, { encoding: 'utf-8' });
export const config: Config = JSON.parse(fileContents);

export default {
  isOneOf,
  nullOrEmpty,
  duringWorkingHoursOrNotSet,
  getDirName,
  config,
};

export interface Config {
  interval: number;
  port: number;
  scrapingAnt: {
    apiKey: string;
    proxy: string;
  };
  googleMaps: {
    apiKey: string;
    destinations: { name: string; address: string }[];
  };
  workingHours: {
    from: string;
    to: string;
  };
  lastRun?: number;
}
