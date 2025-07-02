import fs from 'fs';
import { config } from './lib/utils.js';
import * as similarityCache from '#services/similarity-check/similarityCache';
import { setLastJobExecution } from '#services/storage/listingsStorage.js';
import * as jobStorage from '#services/storage/jobStorage.js';
import FredyRuntime from './lib/FredyRuntime.js';
import { duringWorkingHoursOrNotSet } from './lib/utils.js';
import './lib/api/api.js';
import { track } from '#services/tracking/Tracker.js';
import { handleDemoUser } from '#services/storage/userStorage.js';
import { cleanupDemoAtMidnight } from '#services/demoCleanup.js';
import { ProviderExport } from '#types/ProviderConfig.js';

//if db folder does not exist, ensure to create it before loading anything else
if (!fs.existsSync('./db')) {
  fs.mkdirSync('./db');
}
const path = './lib/provider';
const providerFiles: string[] = fs.readdirSync(path).filter((file) => file.endsWith('.ts'));
const INTERVAL = config.interval! * 60 * 1000;
/* eslint-disable no-console */
console.log(`Started Fredy successfully. Ui can be accessed via http://localhost:${config.port}`);
if (config.demoMode) {
  console.info('Running in demo mode');
  cleanupDemoAtMidnight();
}
/* eslint-enable no-console */

const fetchedProvider = (await Promise.all(
  providerFiles.filter((providerFile) => providerFile.endsWith('.ts')).map(async (pro) => import(`${path}/${pro}`)),
)) as ProviderExport[];

const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const exec = async () => {
  const isDuringWorkingHoursOrNotSet = duringWorkingHoursOrNotSet(config, Date.now());
  if (!config.demoMode) {
    if (isDuringWorkingHoursOrNotSet) {
      track();
      config.lastRun = Date.now();
      jobStorage
        .getJobs()
        .filter((job) => job.enabled)
        .forEach((job) => {
          job.provider
            .filter((p) => fetchedProvider.find((fp) => fp.metaInformation.id === p.id) != null)
            .forEach(async (prov) => {
              const pro = fetchedProvider.find((fp) => fp.metaInformation.id === prov.id) as ProviderExport;
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
};

handleDemoUser();

while (true) {
  await exec();
  const nextRun = new Date(Date.now() + INTERVAL);
  /* eslint-disable-next-line no-console */
  console.log(`scrape done, next scrape at ${nextRun}`);
  await sleep(INTERVAL);
}
