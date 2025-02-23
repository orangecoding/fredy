import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'fs/promises';
import {createHash} from 'crypto';
import {DEFAULT_CONFIG} from './defaultConfig.js';

function inDevMode(){
    return process.env.NODE_ENV == null || process.env.NODE_ENV !== 'production';
}

function isOneOf(word: any, arr: any) {
    if (arr == null || arr.length === 0) {
        return false;
    }
    const expression = String.raw`\b(${arr.join('|')})\b`;
    const blacklist = new RegExp(expression, 'ig');
    return blacklist.test(word);
}

function nullOrEmpty(val: any) {
    return val == null || val.length === 0;
}

function timeStringToMs(timeString: any, now: any) {
    const d = new Date(now);
    const parts = timeString.split(':');
    d.setHours(parts[0]);
    d.setMinutes(parts[1]);
    d.setSeconds(0);
    return d.getTime();
}

function duringWorkingHoursOrNotSet(config: any, now: any) {
    const {workingHours} = config;
    if (workingHours == null || nullOrEmpty(workingHours.from) || nullOrEmpty(workingHours.to)) {
        return true;
    }
    const toDate = timeStringToMs(workingHours.to, now);
    const fromDate = timeStringToMs(workingHours.from, now);
    return fromDate <= now && toDate >= now;
}

function getDirName() {
    // @ts-expect-error TS(1343): The 'import.meta' meta-property is only allowed wh... Remove this comment to see the full error message
    return dirname(fileURLToPath(import.meta.url));
}

function buildHash(...inputs: any[]) {
    if (inputs == null) {
        return null;
    }
    const cleaned = inputs.filter(i => i != null && i.length > 0);
    if (cleaned.length === 0) {
        return null;
    }
    return createHash('sha256')
        .update(cleaned.join(','))
        .digest('hex');
}

let config = {};
export async function readConfigFromStorage(){
    // @ts-expect-error TS(2345): Argument of type 'Buffer' is not assignable to par... Remove this comment to see the full error message
    return JSON.parse(await readFile(new URL('../conf/config.json', import.meta.url)));
}

export async function refreshConfig(){
    try {
        config = await readConfigFromStorage();
        //backwards compatability...
        // @ts-expect-error TS(2339): Property 'analyticsEnabled' does not exist on type... Remove this comment to see the full error message
        config.analyticsEnabled ??= null;
        // @ts-expect-error TS(2339): Property 'demoMode' does not exist on type '{}'.
        config.demoMode ??= false;
    } catch (error) {
        config = {...DEFAULT_CONFIG};
        console.error('Error reading config file', error);
    }
}
// @ts-expect-error TS(1378): Top-level 'await' expressions are only allowed whe... Remove this comment to see the full error message
await refreshConfig();

export {isOneOf};
export {inDevMode};
export {nullOrEmpty};
export {duringWorkingHoursOrNotSet};
export {getDirName};
export {config};
export {buildHash};
export default {
    isOneOf,
    nullOrEmpty,
    duringWorkingHoursOrNotSet,
    getDirName,
    config,
};
