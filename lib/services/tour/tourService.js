/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as jobStorage from '../storage/jobStorage.js';
import * as userStorage from '../storage/userStorage.js';
import { getSettings, getUserSettings, upsertSettings } from '../storage/settingsStorage.js';
import { markListingsChecked, markListingsPriceChecked, storeListings } from '../storage/listingsStorage.js';
import SqliteConnection from '../storage/SqliteConnection.js';
import { DEAL_TYPES } from '../dealType.js';
import logger from '../logger.js';
import demoProviders from '../demo/demoProviders.json' with { type: 'json' };
import { TOUR_JOB_NAME, TOUR_LISTINGS, TOUR_PROVIDER_LINKS } from './tourData.js';

/**
 * The onboarding tour: offered once to every new account, and while it runs, the account is lent
 * an example job with a handful of listings so the pages the tour walks through have something on
 * them.
 *
 * The example data is borrowed, never given. It is removed when the tour ends, however it ends:
 *
 * - finished or cancelled from the tour itself (`finishTour`),
 * - the tab closed or reloaded mid-tour (the browser sends a beacon to the same endpoint),
 * - the session ended by logging out (the logout route calls `cancelTourOnLogout`),
 * - and for everything none of those catch - a crashed browser, a lost network, a server restart
 *   mid-tour - the cleanup cron sweeps up every tour older than {@link TOUR_TTL_MS}.
 *
 * The one piece of state is a per-user setting, {@link TOUR_SETTING}. Its absence means "never
 * asked", which is what makes the offer go to new accounts only: migration 47 gives every account
 * that existed before the tour shipped a marker, so an upgrade does not greet long-standing users
 * with an introduction to a product they already use.
 */

/** Name of the per-user setting holding the tour state. */
export const TOUR_SETTING = 'onboarding_tour';

/**
 * Every state an account's tour can be in. No stored state at all means the tour was never offered.
 *
 * @type {Readonly<{RUNNING: 'running', COMPLETED: 'completed', CANCELLED: 'cancelled', DECLINED: 'declined', PREEXISTING: 'preexisting'}>}
 */
export const TOUR_STATUS = Object.freeze({
  RUNNING: 'running',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DECLINED: 'declined',
  /** Written by migration 47 for accounts that existed before the tour did. */
  PREEXISTING: 'preexisting',
});

/**
 * How the tour can end, as reported by the browser.
 *
 * @type {ReadonlyArray<'completed'|'cancelled'>}
 */
export const TOUR_OUTCOMES = Object.freeze([TOUR_STATUS.COMPLETED, TOUR_STATUS.CANCELLED]);

/**
 * How long a running tour may keep its example data before the cleanup cron takes it away.
 *
 * The tour takes a few minutes. Two hours is generous enough that nobody reading along slowly loses
 * the data under them, and short enough that a tour abandoned by a crashed browser does not leave
 * invented listings in somebody's account for the rest of the day.
 */
export const TOUR_TTL_MS = 2 * 60 * 60 * 1000;

/** Prefix of every tour job id. */
const TOUR_JOB_PREFIX = 'tour-';

/**
 * @typedef {Object} TourSetting
 * @property {string} status One of {@link TOUR_STATUS}.
 * @property {number} [startedAt] Epoch ms the running tour was started at.
 * @property {number} [finishedAt] Epoch ms the tour ended at.
 * @property {string} [listingId] Id of the listing the tour opens on the detail page.
 */

/**
 * @typedef {Object} TourState
 * @property {string|null} status One of {@link TOUR_STATUS}, or null when the tour was never offered.
 * @property {boolean} offer Whether the account should be asked whether it wants the tour.
 * @property {string|null} jobId Id of the example job while the tour runs.
 * @property {string|null} listingId Id of the example listing the detail step opens.
 */

/**
 * The id of a user's example job.
 *
 * One per user, derived from the user id, so starting twice cannot seed twice and the cleanup never
 * has to remember which job belonged to which tour.
 *
 * @param {string} userId
 * @returns {string}
 */
export function tourJobId(userId) {
  return `${TOUR_JOB_PREFIX}${userId}`;
}

/**
 * True when the given job id names a tour's example job.
 *
 * The job router refuses to create jobs under this prefix, so nothing a user saves can be mistaken
 * for one - which matters, because a tour job is never run and is deleted without asking.
 *
 * @param {string|null|undefined} jobId
 * @returns {boolean}
 */
export function isTourJob(jobId) {
  return typeof jobId === 'string' && jobId.startsWith(TOUR_JOB_PREFIX);
}

/**
 * The stored tour setting of one user, or null.
 *
 * @param {string} userId
 * @returns {TourSetting|null}
 */
function readTourSetting(userId) {
  const value = getUserSettings(userId)?.[TOUR_SETTING];
  return value != null && typeof value === 'object' && typeof value.status === 'string' ? value : null;
}

/**
 * @param {string} userId
 * @param {TourSetting} setting
 * @returns {void}
 */
function writeTourSetting(userId, setting) {
  upsertSettings({ [TOUR_SETTING]: setting }, userId);
}

/**
 * Where a user's tour stands, and whether to offer it.
 *
 * A demo instance never offers it: its visitors share one account, the demo job already fills
 * every page, and demo mode refuses the settings write that would remember the answer.
 *
 * @param {string} userId
 * @returns {Promise<TourState>}
 */
export async function getTourState(userId) {
  const settings = await getSettings();
  const stored = readTourSetting(userId);
  const running = stored?.status === TOUR_STATUS.RUNNING;
  return {
    status: stored?.status ?? null,
    offer: stored == null && !settings.demoMode,
    jobId: running ? tourJobId(userId) : null,
    listingId: running ? (stored.listingId ?? null) : null,
  };
}

/**
 * The example job's provider list, joined from the loaded provider modules the way the demo job's
 * is, so the job form and the overview render the entries like any real job's.
 *
 * @param {Array<{metaInformation: {id: string, name: string}}>} providers Loaded provider modules.
 * @returns {Array<{id: string, name: string, url: string, enabled: boolean}>}
 */
export function buildTourProviderList(providers) {
  return (providers || [])
    .filter((prov) => TOUR_PROVIDER_LINKS[prov?.metaInformation?.id] != null)
    .filter((prov) => demoProviders[prov.metaInformation.id] != null)
    .map((prov) => ({
      id: prov.metaInformation.id,
      name: prov.metaInformation.name,
      url: demoProviders[prov.metaInformation.id],
      enabled: true,
    }));
}

/**
 * Put the example job and its listings into a user's account.
 *
 * The job is stored disabled. That keeps it out of everything that works on enabled jobs - the
 * scheduler, the tracking report, the price observations - without a special case in each of them.
 * A manual run is refused separately (`jobExecutionService`), since that path runs disabled jobs.
 *
 * The listings are stamped as freshly checked for activity and price. Their links point at portal
 * front pages, and without the stamp the alive checker and the price tracker would probe those
 * pages as if they were adverts, and mark the listings as gone halfway through the tour.
 *
 * @param {string} userId
 * @param {Array<{metaInformation: {id: string, name: string}}>} providers Loaded provider modules.
 * @param {number} now
 * @returns {string|null} Id of the listing the detail step opens.
 */
function seedTourData(userId, providers, now) {
  const jobId = tourJobId(userId);
  let featuredListingId = null;

  SqliteConnection.withTransaction(() => {
    // A leftover from an earlier attempt goes first, so a restart never doubles the listings.
    jobStorage.removeJob(jobId);
    jobStorage.upsertJob({
      jobId,
      userId,
      name: TOUR_JOB_NAME,
      enabled: false,
      provider: buildTourProviderList(providers),
      notificationAdapter: [],
      dealType: DEAL_TYPES.RENT,
      blacklist: [],
      shareWithUsers: [],
    });

    const stored = [];
    for (const providerId of Object.keys(TOUR_PROVIDER_LINKS)) {
      const batch = TOUR_LISTINGS.filter((listing) => listing.provider === providerId).map((listing) => ({
        id: listing.id,
        title: listing.title,
        description: listing.description,
        address: listing.address,
        price: listing.price,
        size: listing.size,
        rooms: listing.rooms,
        latitude: listing.latitude,
        longitude: listing.longitude,
        buildYear: listing.buildYear,
        energyClass: listing.energyClass,
        link: TOUR_PROVIDER_LINKS[providerId],
        image: null,
        publishedAt: now - listing.publishedHoursAgo * 60 * 60 * 1000,
        // Kept so the featured listing can be found again after `storeListings` swapped the hash
        // for the row id.
        tourHash: listing.id,
      }));
      storeListings(jobId, providerId, batch);
      stored.push(...batch);
    }

    const ids = stored.map((listing) => listing.id);
    markListingsChecked(ids, now);
    markListingsPriceChecked(ids, now);
    featuredListingId = stored.find((listing) => listing.tourHash === TOUR_LISTINGS[0].id)?.id ?? null;
  });

  return featuredListingId;
}

/**
 * Remove a user's example job. Its listings follow through `ON DELETE CASCADE`.
 *
 * Only ever the job under the user's own tour id, and only when the user owns it, so nothing that
 * happens to share the prefix can be deleted on somebody else's behalf.
 *
 * @param {string} userId
 * @returns {boolean} Whether a job was removed.
 */
export function removeTourData(userId) {
  const jobId = tourJobId(userId);
  const job = jobStorage.getJob(jobId);
  if (job == null || job.userId !== userId) {
    return false;
  }
  jobStorage.removeJob(jobId);
  return true;
}

/**
 * Start the tour for a user: seed the example data and mark the tour as running.
 *
 * Starting a tour that is already running starts it over, with fresh data. That is what a second
 * tab or a double click should do, and it keeps the operation idempotent.
 *
 * @param {string} userId
 * @param {Array<{metaInformation: {id: string, name: string}}>} providers Loaded provider modules.
 * @param {number} [now=Date.now()]
 * @returns {{jobId: string, listingId: string|null}}
 */
export function startTour(userId, providers, now = Date.now()) {
  const listingId = seedTourData(userId, providers, now);
  writeTourSetting(userId, { status: TOUR_STATUS.RUNNING, startedAt: now, listingId });
  logger.info(`Onboarding tour started for user ${userId}.`);
  return { jobId: tourJobId(userId), listingId };
}

/**
 * End a user's tour and take the example data away again.
 *
 * The data is removed whatever the stored state says - removing nothing costs nothing, and a
 * leftover job is exactly what this must never leave behind. The state only changes when the tour
 * was actually running, so a late beacon cannot turn a completed tour into a cancelled one.
 *
 * @param {string} userId
 * @param {'completed'|'cancelled'} outcome
 * @param {number} [now=Date.now()]
 * @returns {{wasRunning: boolean, removed: boolean}}
 */
export function finishTour(userId, outcome, now = Date.now()) {
  if (!TOUR_OUTCOMES.includes(outcome)) {
    throw new TypeError(`Unknown tour outcome: ${outcome}`);
  }
  const wasRunning = readTourSetting(userId)?.status === TOUR_STATUS.RUNNING;
  const removed = removeTourData(userId);
  if (wasRunning) {
    writeTourSetting(userId, { status: outcome, finishedAt: now });
    logger.info(`Onboarding tour ${outcome} for user ${userId}.`);
  }
  return { wasRunning, removed };
}

/**
 * Remember that a user does not want the tour, so it is not offered again.
 *
 * @param {string} userId
 * @param {number} [now=Date.now()]
 * @returns {void}
 */
export function declineTour(userId, now = Date.now()) {
  writeTourSetting(userId, { status: TOUR_STATUS.DECLINED, finishedAt: now });
}

/**
 * Forget everything about a user's tour, as if the account had never been asked.
 *
 * For development only - the route that calls it refuses outside dev mode. A running tour's example
 * data goes first, so a reset can never strand it.
 *
 * @param {string} userId
 * @returns {void}
 */
export function resetTour(userId) {
  removeTourData(userId);
  upsertSettings({ [TOUR_SETTING]: null }, userId);
  logger.info(`Onboarding tour reset for user ${userId}.`);
}

/**
 * Cancel a running tour because its session is ending. Nothing happens for anybody else.
 *
 * @param {string|null|undefined} userId
 * @returns {void}
 */
export function cancelTourOnLogout(userId) {
  if (!userId || readTourSetting(userId)?.status !== TOUR_STATUS.RUNNING) {
    return;
  }
  finishTour(userId, TOUR_STATUS.CANCELLED);
}

/**
 * Remove every tour's example data that nobody is going to clean up any more.
 *
 * Two kinds: a tour still marked running after {@link TOUR_TTL_MS}, whose browser evidently never
 * came back to end it, and an example job whose owner's tour is no longer running at all - the
 * leftover of a process that died between removing the state and removing the job.
 *
 * @param {Object} [params]
 * @param {number} [params.now=Date.now()]
 * @param {number} [params.ttlMs=TOUR_TTL_MS]
 * @returns {number} How many tours were cleaned up.
 */
export function cleanupAbandonedTours({ now = Date.now(), ttlMs = TOUR_TTL_MS } = {}) {
  let cleaned = 0;

  for (const user of userStorage.getUsers()) {
    const stored = readTourSetting(user.id);
    if (stored?.status !== TOUR_STATUS.RUNNING) continue;
    const startedAt = Number(stored.startedAt);
    if (Number.isFinite(startedAt) && now - startedAt < ttlMs) continue;
    finishTour(user.id, TOUR_STATUS.CANCELLED, now);
    cleaned += 1;
  }

  for (const job of jobStorage.getJobs({ includeDisabled: true })) {
    if (!isTourJob(job.id) || job.id !== tourJobId(job.userId)) continue;
    if (readTourSetting(job.userId)?.status === TOUR_STATUS.RUNNING) continue;
    if (removeTourData(job.userId)) {
      cleaned += 1;
    }
  }

  if (cleaned > 0) {
    logger.info(`Removed the example data of ${cleaned} abandoned onboarding tour(s).`);
  }
  return cleaned;
}
