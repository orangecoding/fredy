import fs from 'fs';
import {config} from './lib/utils.js';
import * as similarityCache from './lib/services/similarity-check/similarityCache.js';
import { setLastJobExecution } from './lib/services/storage/listingsStorage.js';
import * as jobStorage from './lib/services/storage/jobStorage.js';
import FredyRuntime from './lib/FredyRuntime.js';
import { duringWorkingHoursOrNotSet } from './lib/utils.js';
import './lib/api/api.js';
import {track} from './lib/services/tracking/Tracker.js';
import {handleDemoUser} from './lib/services/storage/userStorage.js';
import {cleanupDemoAtMidnight} from './lib/services/demoCleanup.js';
//if db folder does not exist, ensure to create it before loading anything else
if (!fs.existsSync('./db')) {
  fs.mkdirSync('./db');
}
const path = './lib/provider';
const provider = fs.readdirSync(path).filter((file) => file.endsWith('.js'));
//assuming interval is always in minutes
// @ts-expect-error TS(2339): Property 'interval' does not exist on type '{}'.
const INTERVAL = config.interval * 60 * 1000;
/* eslint-disable no-console */
// @ts-expect-error TS(2339): Property 'port' does not exist on type '{}'.
console.log(`Started Fredy successfully. Ui can be accessed via http://localhost:${config.port}`);
// @ts-expect-error TS(2339): Property 'demoMode' does not exist on type '{}'.
if(config.demoMode){
    console.info('Running in demo mode');
    cleanupDemoAtMidnight();
}
/* eslint-enable no-console */
// @ts-expect-error TS(1378): Top-level 'await' expressions are only allowed whe... Remove this comment to see the full error message
const fetchedProvider = await Promise.all(
  provider.filter((provider) => provider.endsWith('.js')).map(async (pro) => import(`${path}/${pro}`))
);

handleDemoUser();

setInterval(
  (function exec() {
    const isDuringWorkingHoursOrNotSet = duringWorkingHoursOrNotSet(config, Date.now());
        // @ts-expect-error TS(2339): Property 'demoMode' does not exist on type '{}'.
        if(!config.demoMode) {
            if (isDuringWorkingHoursOrNotSet) {
                track();
                // @ts-expect-error TS(2339): Property 'lastRun' does not exist on type '{}'.
                config.lastRun = Date.now();
                jobStorage
                    .getJobs()
                    .filter((job: any) => job.enabled)
                    .forEach((job: any) => {
                        job.provider
                            .filter((p: any) => fetchedProvider.find((fp) => fp.metaInformation.id === p.id) != null)
                            .forEach(async (prov: any) => {
                                const pro = fetchedProvider.find((fp) => fp.metaInformation.id === prov.id);
                                pro.init(prov, job.blacklist);
                                await new FredyRuntime(pro.config, job.notificationAdapter, prov.id, job.id, similarityCache).execute();
                                setLastJobExecution(job.id);
                            });
                    });
            } else {
                /* eslint-disable no-console */
                console.debug('Working hours set. Skipping as outside of working hours.');
                /* eslint-enable no-console */
            }
        }
    return exec;
  })(),
  INTERVAL
);
