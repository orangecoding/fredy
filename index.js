/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import { checkIfConfigIsAccessible, getProviders, refreshConfig } from './lib/utils.js';
import * as similarityCache from './lib/services/similarity-check/similarityCache.js';
import { runMigrations } from './lib/services/storage/migrations/migrate.js';
import { ensureDemoUserExists, ensureAdminUserExists } from './lib/services/storage/userStorage.js';
import { initTrackerCron } from './lib/services/crons/tracker-cron.js';
import logger from './lib/services/logger.js';
import { reloadEnabledFromSettings } from './lib/services/debug/debugLogStorage.js';
import { initActiveCheckerCron } from './lib/services/crons/listing-alive-cron.js';
import { initGeocodingCron } from './lib/services/crons/geocoding-cron.js';
import { getSettings } from './lib/services/storage/settingsStorage.js';
import SqliteConnection, { computeDbPath } from './lib/services/storage/SqliteConnection.js';
import { initJobExecutionService } from './lib/services/jobs/jobExecutionService.js';
import { ensureValidBinary } from './lib/services/ensureValidBinary.js';
import { removeObsoleteProviders } from './lib/services/providers/providerCleanup.js';
import { seedDemo, warnOnDefaultAdminPassword } from './lib/services/demo/demoService.js';
import { initDemoCleanupCron } from './lib/services/crons/demo-cleanup-cron.js';
import { initSessionCleanupCron } from './lib/services/crons/session-cleanup-cron.js';
import { initListingRetentionCron } from './lib/services/crons/listing-retention-cron.js';
import { initPriceTrackingCron } from './lib/services/crons/price-tracking-cron.js';

// Ensure the CloakBrowser stealth Chromium binary is present and complete before
// jobs run.  ensureValidBinary() also detects and auto-heals partial extractions
// (e.g. a newer version that was downloaded but only the chrome executable was
// written) so Chrome never crashes with "Invalid file descriptor to ICU data".
logger.info('Checking CloakBrowser binary...');
await ensureValidBinary();
logger.info('CloakBrowser binary ready.');

// Configuration comes first, because everything below reads it - SqliteConnection.init() in
// particular resolves the database directory from `sqlitepath`.
//
// This used to run one step later, after SqliteConnection.init(), which made a fresh Docker
// container unstartable: the image ships no conf/config.json (`.dockerignore` excludes `conf/`, the
// Dockerfile only creates an empty /conf volume), so the very first read threw ENOENT and the
// create-with-defaults below never got the chance to run. A source checkout has the file committed,
// which is why this only ever showed up in containers.
if (!(await checkIfConfigIsAccessible())) {
  logger.error('Configuration exists, but is not accessible. Please check the file permission');
  process.exit(1);
}

try {
  await refreshConfig();
} catch (error) {
  logger.error(error.message, error.cause ?? error);
  process.exit(1);
}

await SqliteConnection.init();

// Run DB migrations once at startup and block until finished. A failure here is fatal: continuing
// would start the API and the schedulers against a schema that is missing the failed migration and
// everything after it.
try {
  await runMigrations();
} catch (err) {
  logger.error('Database migration failed. Refusing to start.', err.cause ?? err);
  process.exit(1);
}

const settings = await getSettings();

// Restore the persisted on/off flag for opt-in DB log capture so it survives a
// Fredy restart. reloadEnabledFromSettings() also (un)wires the logger sink based
// on the restored flag, so the logger hot path stays cost-free when nobody enabled
// the feature.
await reloadEnabledFromSettings();

// Ensure the sqlite directory exists before loading anything else (based on config.sqlitepath)
const { dir: sqliteDir } = await computeDbPath();
if (!fs.existsSync(sqliteDir)) {
  fs.mkdirSync(sqliteDir, { recursive: true });
}

// Load provider modules once at startup
const providers = await getProviders();

// A provider that was deleted from lib/provider still lives on in the DB (in the provider config
// of existing jobs and in the listings it found). Those leftovers can never be scraped or
// re-checked again, so they are pruned before anything starts working with jobs or listings.
removeObsoleteProviders(providers);

similarityCache.initSimilarityCache();
similarityCache.startSimilarityCacheReloader();

//assuming interval is always in minutes
const INTERVAL = settings.interval * 60 * 1000;

// Initialize API only after migrations completed
await import('./lib/api/api.js');

if (settings.demoMode) {
  logger.info('Running in demo mode');
}

await ensureAdminUserExists();
await ensureDemoUserExists();

// A demo instance must always present a working Fredy: the demo job is created on the first
// start and repaired on every later one, so a drifted config can never leave the demo empty.
await seedDemo(providers);
await warnOnDefaultAdminPassword();

await initTrackerCron();
//do not wait for this to finish, let it run in the background
initActiveCheckerCron();
initGeocodingCron();
await initDemoCleanupCron();
await initSessionCleanupCron();
await initListingRetentionCron();
// Schedules only. Unlike the others this one is never run on start: it renders a browser page per
// listing, and a restart is the worst moment to begin doing that.
initPriceTrackingCron();

logger.info(`Started Fredy successfully. Ui can be accessed via http://localhost:${settings.port}`);

// Initialize the lean Job Execution Service (schedules and bus listeners)
initJobExecutionService({ providers, intervalMs: INTERVAL });
