import fs from 'fs';
import { config } from './lib/utils.js';
import * as similarityCache from './lib/services/similarity-check/similarityCache.js';
import { setLastJobExecution } from './lib/services/storage/listingsStorage.js';
import * as jobStorage from './lib/services/storage/jobStorage.js';
import FredyRuntime from './lib/FredyRuntime.js';
import { duringWorkingHoursOrNotSet } from './lib/utils.js';
import './lib/api/api.js';
import { handleDemoUser } from './lib/services/storage/userStorage.js';
import { cleanupDemoAtMidnight } from './lib/services/demoCleanup.js';
import { initTrackerCron } from './lib/services/tracking/Tracker-Cron.js';
import logger from './lib/services/logger.js';
//if db folder does not exist, ensure to create it before loading anything else
if (!fs.existsSync('./db')) {
  fs.mkdirSync('./db');
}
const path = './lib/provider';
const provider = fs.readdirSync(path).filter((file) => file.endsWith('.js'));
//assuming interval is always in minutes
const INTERVAL = config.interval * 60 * 1000;
logger.info(`Started Fredy successfully. Ui can be accessed via http://localhost:${config.port}`);
if (config.demoMode) {
  logger.info('Running in demo mode');
  cleanupDemoAtMidnight();
}
const fetchedProvider = await Promise.all(
  provider.filter((provider) => provider.endsWith('.js')).map(async (pro) => import(`${path}/${pro}`)),
);

handleDemoUser();
await initTrackerCron();

setInterval(
  (function exec() {
    const isDuringWorkingHoursOrNotSet = duringWorkingHoursOrNotSet(config, Date.now());
    if (!config.demoMode) {
      if (isDuringWorkingHoursOrNotSet) {
        config.lastRun = Date.now();
        jobStorage
          .getJobs()
          .filter((job) => job.enabled)
          .forEach((job) => {
            job.provider
              .filter((p) => fetchedProvider.find((fp) => fp.metaInformation.id === p.id) != null)
              .forEach(async (prov) => {
                const pro = fetchedProvider.find((fp) => fp.metaInformation.id === prov.id);
                pro.init(prov, job.blacklist);
                await new FredyRuntime(pro.config, job.notificationAdapter, prov.id, job.id, similarityCache).execute();
                setLastJobExecution(job.id);
              });
          });
      } else {
        logger.debug('Working hours set. Skipping as outside of working hours.');
      }
    }
    return exec;
  })(),
  INTERVAL,
);
