import fs from 'fs';
import path from 'path';
import { checkIfConfigIsAccessible, config, getProviders, refreshConfig } from './lib/utils.js';
import * as similarityCache from './lib/services/similarity-check/similarityCache.js';
import * as jobStorage from './lib/services/storage/jobStorage.js';
import FredyPipeline from './lib/FredyPipeline.js';
import { duringWorkingHoursOrNotSet } from './lib/utils.js';
import { runMigrations } from './lib/services/storage/migrations/migrate.js';
import { ensureDemoUserExists, ensureAdminUserExists } from './lib/services/storage/userStorage.js';
import { cleanupDemoAtMidnight } from './lib/services/crons/demoCleanup-cron.js';
import { initTrackerCron } from './lib/services/crons/tracker-cron.js';
import logger from './lib/services/logger.js';
import { bus } from './lib/services/events/event-bus.js';
import { initActiveCheckerCron } from './lib/services/crons/listing-alive-cron.js';

// Load configuration before any other startup steps
await refreshConfig();

const isConfigAccessible = await checkIfConfigIsAccessible();

if (!isConfigAccessible) {
  logger.error('Configuration exists, but is not accessible. Please check the file permission');
  process.exit(1);
}

// Ensure sqlite directory exists before loading anything else (based on config.sqlitepath)
const rawDir = config.sqlitepath || '/db';
const relDir = rawDir.startsWith('/') ? rawDir.slice(1) : rawDir;
const absDir = path.isAbsolute(relDir) ? relDir : path.join(process.cwd(), relDir);
if (!fs.existsSync(absDir)) {
  fs.mkdirSync(absDir, { recursive: true });
}

// Run DB migrations once at startup and block until finished
await runMigrations();

// Load provider modules once at startup
const providers = await getProviders();

similarityCache.initSimilarityCache();
similarityCache.startSimilarityCacheReloader();

//assuming interval is always in minutes
const INTERVAL = config.interval * 60 * 1000;

// Initialize API only after migrations completed
await import('./lib/api/api.js');

if (config.demoMode) {
  logger.info('Running in demo mode');
  cleanupDemoAtMidnight();
}

logger.info(`Started Fredy successfully. Ui can be accessed via http://localhost:${config.port}`);

ensureAdminUserExists();
ensureDemoUserExists();
await initTrackerCron();
//do not wait for this to finish, let it run in the background
initActiveCheckerCron();

bus.on('jobs:runAll', () => {
  logger.debug('Running Fredy Job manually');
  execute();
});

const execute = () => {
  const isDuringWorkingHoursOrNotSet = duringWorkingHoursOrNotSet(config, Date.now());
  if (!config.demoMode) {
    if (isDuringWorkingHoursOrNotSet) {
      config.lastRun = Date.now();
      jobStorage
        .getJobs()
        .filter((job) => job.enabled)
        .forEach((job) => {
          job.provider
            .filter((p) => providers.find((loaded) => loaded.metaInformation.id === p.id) != null)
            .forEach(async (prov) => {
              const matchedProvider = providers.find((loaded) => loaded.metaInformation.id === prov.id);
              matchedProvider.init(prov, job.blacklist);
              await new FredyPipeline(
                matchedProvider.config,
                job.notificationAdapter,
                prov.id,
                job.id,
                similarityCache,
              ).execute();
            });
        });
    } else {
      logger.debug('Working hours set. Skipping as outside of working hours.');
    }
  }
};

setInterval(execute, INTERVAL);
//start once at startup
execute();
