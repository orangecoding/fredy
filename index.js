import fs from 'fs';
import path from 'path';
import { config } from './lib/utils.js';
import * as similarityCache from './lib/services/similarity-check/similarityCache.js';
import * as jobStorage from './lib/services/storage/jobStorage.js';
import FredyRuntime from './lib/FredyRuntime.js';
import { duringWorkingHoursOrNotSet } from './lib/utils.js';
import { runMigrations } from './lib/services/storage/migrations/migrate.js';
import { ensureDemoUserExists, ensureAdminUserExists } from './lib/services/storage/userStorage.js';
import { cleanupDemoAtMidnight } from './lib/services/demoCleanup.js';
import { initTrackerCron } from './lib/services/tracking/Tracker-Cron.js';
import logger from './lib/services/logger.js';

// Ensure sqlite directory exists before loading anything else (based on config.sqlitepath)
const rawDir = config.sqlitepath || '/db';
const relDir = rawDir.startsWith('/') ? rawDir.slice(1) : rawDir;
const absDir = path.isAbsolute(relDir) ? relDir : path.join(process.cwd(), relDir);
if (!fs.existsSync(absDir)) {
  fs.mkdirSync(absDir, { recursive: true });
}

// Run DB migrations once at startup and block until finished
await runMigrations();

const providersPath = './lib/provider';
const provider = fs.readdirSync(providersPath).filter((file) => file.endsWith('.js'));
//assuming interval is always in minutes
const INTERVAL = config.interval * 60 * 1000;

// Initialize API only after migrations completed
await import('./lib/api/api.js');

if (config.demoMode) {
  logger.info('Running in demo mode');
  cleanupDemoAtMidnight();
}

logger.info(`Started Fredy successfully. Ui can be accessed via http://localhost:${config.port}`);

const fetchedProvider = await Promise.all(
  provider.filter((provider) => provider.endsWith('.js')).map(async (pro) => import(`${providersPath}/${pro}`)),
);

ensureAdminUserExists();
ensureDemoUserExists();
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
