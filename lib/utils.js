import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'fs/promises';

function isOneOf(word, arr) {
  if (arr == null || arr.length === 0) {
    return false;
  }
  const expression = String.raw`\b(${arr.join('|')})\b`;
  const blacklist = new RegExp(expression, 'ig');
  return blacklist.test(word);
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

const config = JSON.parse(await readFile(new URL('../conf/config.json', import.meta.url)));

export { isOneOf };
export { nullOrEmpty };
export { duringWorkingHoursOrNotSet };
export { getDirName };
export { config };
export default {
  isOneOf,
  nullOrEmpty,
  duringWorkingHoursOrNotSet,
  getDirName,
  config,
};
