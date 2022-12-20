const fs = require('fs');

//if db folder does not exist, ensure to create it before loading anything else
if (!fs.existsSync('./db')) {
  fs.mkdirSync('./db');
}

const path = './lib/provider';
const provider = fs.readdirSync(path).filter((file) => file.endsWith('.js'));
const config = require('./conf/config.json');

const similarityCache = require('./lib/services/similarity-check/similarityCache');
const { setLastJobExecution } = require('./lib/services/storage/listingsStorage');
const jobStorage = require('./lib/services/storage/jobStorage');
const FredyRuntime = require('./lib/FredyRuntime');

const { duringWorkingHoursOrNotSet } = require('./lib/utils');

//starting the api service
require('./lib/api/api');

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
      const fetchedProvider = provider
        .filter((provider) => provider.endsWith('.js'))
        .map((pro) => require(`${path}/${pro}`));

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
      /* eslint-disable no-console */
      console.debug('Working hours set. Skipping as outside of working hours.');
      /* eslint-enable no-console */
    }
    return exec;
  })(),
  INTERVAL
);
