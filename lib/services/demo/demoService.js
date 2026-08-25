/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as jobStorage from '../storage/jobStorage.js';
import * as userStorage from '../storage/userStorage.js';
import * as hasher from '../security/hash.js';
import SqliteConnection from '../storage/SqliteConnection.js';
import { deleteInactiveListingsByJobId } from '../storage/listingsStorage.js';
import { getSettings, upsertSettings } from '../storage/settingsStorage.js';
import { runGeoCordTask } from '../crons/geocoding-cron.js';
import { DEFAULT_NEBENKOSTEN_PCT } from '../finance/constants.js';
import { DEAL_TYPES } from '../dealType.js';
import logger from '../logger.js';
import * as channelStorage from '../storage/configuredAdapterStorage.js';
import demoProviders from './demoProviders.json' with { type: 'json' };

/** Stable id of the one job a demo instance runs. Identity is by id, never by name. */
export const DEMO_JOB_ID = 'demo-job';

/** Display name of the demo job. */
export const DEMO_JOB_NAME = 'Demo-Job';

/**
 * The demo household's home address. The coordinates are hardcoded rather than geocoded so
 * startup stays offline, deterministic and testable.
 */
const DEMO_HOME_ADDRESS = Object.freeze({
  label: 'Zuhause',
  address: 'Adlerstraße, Pempelfort, Stadtbezirk 1, Düsseldorf, Nordrhein-Westfalen, 40211, Deutschland',
  coords: Object.freeze({ lat: 51.230581, lng: 6.793402 }),
});

/**
 * True when the given job id is the demo job.
 *
 * Matching on the id rather than on the name matters: any user can create a job called
 * "Demo-Job" and would otherwise inherit its protection.
 *
 * @param {string|null|undefined} jobId
 * @returns {boolean}
 */
export function isDemoJob(jobId) {
  return jobId === DEMO_JOB_ID;
}

/**
 * The demo user, or null when demo mode was never switched on.
 *
 * @returns {{id: string, username: string}|null}
 */
function getDemoUser() {
  return userStorage.getUsers().find((user) => user.username === userStorage.DEMO_USERNAME) || null;
}

/**
 * Build the demo job's provider list by joining the loaded provider modules with the demo
 * url map.
 *
 * A job's provider entry needs `name` (rendered by the UI) and `enabled` (read by every
 * provider's `init()`), so the list cannot be stored verbatim as JSON. Joining also means a
 * provider added without a demo url is skipped rather than seeded broken, and a url left
 * behind for a deleted provider is ignored.
 *
 * @param {Array<{metaInformation: {id: string, name: string}}>} providers Loaded provider modules.
 * @returns {Array<{id: string, name: string, url: string, enabled: boolean}>}
 */
export function buildDemoProviderList(providers) {
  return (providers || [])
    .filter((prov) => demoProviders[prov?.metaInformation?.id] != null)
    .map((prov) => ({
      id: prov.metaInformation.id,
      name: prov.metaInformation.name,
      url: demoProviders[prov.metaInformation.id],
      enabled: true,
    }));
}

/**
 * The demo household's finance profile.
 *
 * The numbers are picked so the affordable cold-rent ceiling lands on exactly 1200 EUR, which
 * is what the demo listings are meant to be scored against:
 *
 *   netIncome      = 3200 + 1800     = 5000
 *   headroom       = 0.35 * 5000     = 1750
 *   disposable     = 5000 - 3500     = 1500
 *   warmAffordable = min(1750, 1500) = 1500
 *   coldAffordable = 1500 / 1.25     = 1200
 *
 * The purchase side stays at its defaults - the demo job searches for rentals.
 *
 * @returns {import('../../types/finance.js').FinanceProfile}
 */
function demoFinanceProfile() {
  return {
    personA: { label: 'A', enabled: true, age: 35, primaryIncome: 3200, secondaryIncome: 0 },
    personB: { label: 'B', enabled: true, age: 34, primaryIncome: 1800, secondaryIncome: 0 },
    livingCosts: 3500,
    existingDebt: 0,
    existingDebtRate: 0,
    existingDebtInterest: 0,
    rollFreedBudgetIntoMortgage: false,
    renting: {
      nebenkostenPct: DEFAULT_NEBENKOSTEN_PCT,
    },
  };
}

/**
 * The channel the demo job notifies through.
 *
 * Created on demand and reused, so re-seeding the demo does not pile up duplicates in the owner's
 * channel list.
 *
 * @param {string} userId - Owner of the demo job.
 * @returns {{configuredAdapterId: string}}
 */
function demoChannelRef(userId) {
  const existing = channelStorage
    .getAllChannels()
    .find((channel) => channel.userId === userId && channel.adapterId === 'demo');
  const id =
    existing?.id ??
    channelStorage.upsertChannel({
      userId,
      adapterId: 'demo',
      name: 'Demo',
      fields: {},
      visibility: channelStorage.VISIBILITY.PRIVATE,
    });
  return { configuredAdapterId: id };
}

/**
 * The per-user settings a demo visitor is still able to change.
 *
 * Everything else on `/api/user/settings` refuses non-admins while demo mode is on, so these four
 * are exactly what one visitor can leave behind for the next: a light theme, a German interface,
 * a table instead of a grid.
 *
 * @type {ReadonlyArray<string>}
 */
const DEMO_USER_PREFERENCES = Object.freeze(['theme', 'language', 'jobs_view_mode', 'listings_view_mode']);

/**
 * Drop the demo user's own preferences so the interface falls back to its defaults.
 *
 * Deleting the rows rather than writing defaults into them is deliberate: the defaults live in
 * the UI (`DEFAULT_THEME`, `?? 'grid'`, `?? 'en'`), and "never picked anything" is precisely the
 * state the demo user should be in. Writing values here would be a second copy of those defaults,
 * free to drift away from the real ones.
 *
 * Synchronous, so callers that already hold the demo user can run it inside their transaction.
 *
 * @param {string} userId - The demo user.
 * @returns {void}
 */
function clearDemoUserPreferences(userId) {
  upsertSettings(Object.fromEntries(DEMO_USER_PREFERENCES.map((name) => [name, null])), userId);
}

/**
 * Put the demo user's interface back on grid views, English and the dark theme.
 *
 * @returns {Promise<void>}
 */
export async function resetDemoUserPreferences() {
  const settings = await getSettings();
  if (!settings.demoMode) return;

  const demoUser = getDemoUser();
  if (demoUser == null) return;

  clearDemoUserPreferences(demoUser.id);
  logger.info('Demo user preferences reset to their defaults.');
}

/**
 * Create the demo job, or repair it when it drifted.
 *
 * The fixed job id makes this idempotent and turns every startup into a repair pass.
 * `upsertJob` preserves the owner on update, so a repair can never re-own the job, and because
 * the row is updated instead of replaced, the job keeps its listings.
 *
 * @param {Array<{metaInformation: {id: string, name: string}}>} providers Loaded provider modules.
 * @returns {Promise<void>}
 */
export async function seedDemoJob(providers) {
  const settings = await getSettings();
  if (!settings.demoMode) return;

  const demoUser = getDemoUser();
  if (demoUser == null) {
    logger.warn('Demo mode is on but no demo user exists. Skipping demo job seeding.');
    return;
  }

  jobStorage.upsertJob({
    jobId: DEMO_JOB_ID,
    userId: demoUser.id,
    name: DEMO_JOB_NAME,
    enabled: true,
    provider: buildDemoProviderList(providers),
    notificationAdapter: [demoChannelRef(demoUser.id)],
    dealType: DEAL_TYPES.RENT,
    blacklist: [],
    spatialFilter: null,
    specFilter: null,
    shareWithUsers: [],
  });
  logger.info(`Demo job "${DEMO_JOB_NAME}" seeded.`);
}

/**
 * Seed the demo user's finance profile so the affordability scoring has something to show.
 *
 * Written on every startup: the demo user cannot change it anyway (demo mode blocks the
 * settings routes for non-admins), so a plain overwrite keeps the demo honest.
 *
 * @returns {Promise<void>}
 */
export async function seedDemoFinanceProfile() {
  const settings = await getSettings();
  if (!settings.demoMode) return;

  const demoUser = getDemoUser();
  if (demoUser == null) return;

  upsertSettings({ finance_profile: demoFinanceProfile() }, demoUser.id);
  logger.info('Demo finance profile seeded.');
}

/**
 * Seed the demo user's home address so the distance column and the map have a reference point.
 *
 * Mirrors what `POST /api/user/settings/home-address` does, minus the geocoding call: the
 * coordinates are known and hardcoded. `runGeoCordTask()` is still triggered so the distances
 * of existing listings get computed.
 *
 * @returns {Promise<void>}
 */
export async function seedDemoHomeAddress() {
  const settings = await getSettings();
  if (!settings.demoMode) return;

  const demoUser = getDemoUser();
  if (demoUser == null) return;

  upsertSettings({ home_addresses: [{ ...DEMO_HOME_ADDRESS, coords: { ...DEMO_HOME_ADDRESS.coords } }] }, demoUser.id);
  runGeoCordTask();
  logger.info('Demo home address seeded.');
}

/**
 * Bring a demo instance into its canonical state. The only seeding call `index.js` makes.
 *
 * @param {Array<{metaInformation: {id: string, name: string}}>} providers Loaded provider modules.
 * @returns {Promise<void>}
 */
export async function seedDemo(providers) {
  await seedDemoJob(providers);
  await seedDemoFinanceProfile();
  await seedDemoHomeAddress();
  await resetDemoUserPreferences();
}

/**
 * Log a loud banner when the administrator account still uses the shipped default password.
 *
 * Deliberately not gated on demo mode: `admin`/`admin` is a risk on every self-hosted
 * instance, and a publicly reachable demo is only the most obvious case. Never throws - a
 * missing admin or an unreadable hash must not block startup.
 *
 * @returns {Promise<boolean>} True when the warning was emitted.
 */
export async function warnOnDefaultAdminPassword() {
  try {
    const admin = userStorage.getUserWithSecretsByUsername(userStorage.ADMIN_USERNAME);
    if (admin?.password == null) return false;
    if (!(await hasher.verify(userStorage.DEFAULT_ADMIN_PASSWORD, admin.password))) return false;

    logger.warn(
      [
        '',
        '**************************************************************************',
        '*                                                                        *',
        '*   !!!  DEFAULT ADMIN PASSWORD IN USE  !!!                              *',
        '*                                                                        *',
        '*   The "admin" account still uses the default password "admin".         *',
        '*   Anyone who can reach this instance can take it over.                 *',
        '*   Change it now: Settings -> Users -> admin.                           *',
        '*                                                                        *',
        '**************************************************************************',
        '',
      ].join('\n'),
    );
    return true;
  } catch (err) {
    logger.error('Could not verify whether the admin password is still the default.', err);
    return false;
  }
}

/**
 * Reset a demo instance back to its canonical state.
 *
 * Visitors may create their own jobs - those never run, and this removes them together with
 * their listings (`ON DELETE CASCADE`). The demo job's dead listings are hard deleted so the
 * demo database does not grow without bound. The preferences a visitor could change - theme,
 * language, the two view modes - go back to their defaults, because a demo left in light mode
 * and Turkish is as far from canonical as one full of foreign jobs. The demo job itself, its
 * live listings, the demo user and the seeded settings are never touched.
 *
 * @returns {Promise<{jobsRemoved: number}>} How many foreign demo-user jobs were removed.
 */
export async function cleanupDemoData() {
  const settings = await getSettings();
  if (!settings.demoMode) return { jobsRemoved: 0 };

  const demoUser = getDemoUser();
  if (demoUser == null) return { jobsRemoved: 0 };

  const doomed = jobStorage
    .getJobs({ includeDisabled: true })
    .filter((job) => job.userId === demoUser.id && !isDemoJob(job.id));

  SqliteConnection.withTransaction(() => {
    doomed.forEach((job) => jobStorage.removeJob(job.id));
    deleteInactiveListingsByJobId(DEMO_JOB_ID);
    clearDemoUserPreferences(demoUser.id);
  });

  logger.info(`Demo cleanup done. Removed ${doomed.length} job(s) and the demo job's inactive listings.`);
  return { jobsRemoved: doomed.length };
}
