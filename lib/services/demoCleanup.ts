import { setInterval } from 'node:timers';
import {removeJobsByUserName} from './storage/jobStorage.js';
import {config} from '../utils.js';

/**
 * if we are running in demo environment, we have to cleanup the db files (specifically the jobs table)
 */
export function cleanupDemoAtMidnight() {
    const now = new Date();
    const millisUntilMidnightUTC = (24 - now.getUTCHours()) * 60 * 60 * 1000
        - now.getUTCMinutes() * 60 * 1000
        - now.getUTCSeconds() * 1000
        - now.getUTCMilliseconds();

    setTimeout(() => {
        cleanup();

        setInterval(() => {
            cleanup();
        }, 24 * 60 * 60 * 1000);

    }, millisUntilMidnightUTC);
}

function cleanup(){
    if(config.demoMode){
        removeJobsByUserName('demo');
    }
}