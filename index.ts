import fs from 'fs';
import { config } from './lib/utils.js';
import { setLastJobExecution } from './lib/services/storage/listingsStorage.js';
import * as jobStorage from './lib/services/storage/jobStorage.js';
import FredyRuntime from './lib/FredyRuntime.js';
import { duringWorkingHoursOrNotSet } from './lib/utils.js';
import './lib/api/api.js';
import { ProviderJobInformation, providers } from './lib/provider/provider.js';
//if db folder does not exist, ensure to create it before loading anything else
if (!fs.existsSync('./db')) {
  fs.mkdirSync('./db');
}
//assuming interval is always in minutes
const INTERVAL = config.interval * 60 * 1000;
/* eslint-disable no-console */
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
          const validJobProviders: ProviderJobInformation[] = job.provider.filter(
            (provider: ProviderJobInformation) => {
              const hasExistingProvider =
                providers.find((loadedProvider) => loadedProvider.metaInformation.id === provider.id) != null;
              return hasExistingProvider;
            }
          );
          validJobProviders.forEach(async (jobProvider) => {
            const provider = providers.find((provider) => provider.metaInformation.id === jobProvider.id)!;
            provider.init(jobProvider, job.blacklist);

            await new FredyRuntime(
              provider.config,
              job.notificationAdapter,
              jobProvider.id,
              job.id,
              job.listingProcessors
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
