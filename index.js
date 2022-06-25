import fs  from 'fs';
import {readConfig} from './lib/utils.js';

//if db folder does not exist, ensure to create it before loading anything else
if (!fs.existsSync('./db')) {
  fs.mkdirSync('./db');
}

const path = './lib/provider';
const provider = fs.readdirSync(path).filter((file) => file.endsWith('.js'));
const config = readConfig();

import similarityCache from './lib/services/similarity-check/similarityCache.js';
import { setLastJobExecution } from './lib/services/storage/listingsStorage.js';
import jobStorage from './lib/services/storage/jobStorage.js';
import FredyRuntime from './lib/FredyRuntime.js';

import { duringWorkingHoursOrNotSet }  from './lib/utils.js';

//starting the api service
import apiStart from './lib/api/api.js';

//assuming interval is always in minutes
const INTERVAL = config.interval * 60 * 1000;

/* eslint-disable no-console */
apiStart();
console.log(`Started Fredy successfully. Ui can be accessed via http://localhost:${config.port}`);
/* eslint-enable no-console */
setInterval(
  (function exec() {
    const isDuringWorkingHoursOrNotSet = duringWorkingHoursOrNotSet(config, Date.now());

    if (isDuringWorkingHoursOrNotSet) {
      config.lastRun = Date.now();
      jobStorage
        .getJobs()
        .filter((job) => job.enabled)
        .forEach((job) => {
          const providerIds = job.provider.map((provider) => provider.id);

          provider
            .filter((provider) => provider.endsWith('.js'))
            .map((pro) => require(`${path}/${pro}`))
            .filter((provider) => providerIds.indexOf(provider.metaInformation.id) !== -1)
            .forEach(async (pro) => {
              const providerId = pro.metaInformation.id;
              if (providerId == null || providerId.length === 0) {
                throw new Error('Provider id must not be empty. => ' + pro);
              }
              const providerConfig = job.provider.find((jobProvider) => jobProvider.id === providerId);
              if (providerConfig == null) {
                throw new Error(`Provider Config for provider with id ${providerId} not found.`);
              }
              pro.init(providerConfig, job.blacklist);
              await new FredyRuntime(
                pro.config,
                job.notificationAdapter,
                providerId,
                job.id,
                similarityCache
              ).execute();
              setLastJobExecution(job.id);
            });
        });
    } else {
      /* eslint-disable no-console */
      console.debug('Working hours set. Skipping as outside of working hours.');
      /* eslint-enable no-console */
    }
    return exec;
  })(),
  INTERVAL
);
