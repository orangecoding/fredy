/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Search jobs: running, switching, deleting and saving them.
 *
 * The web job routes (`jobRouter.js`) and the MCP job tools both call these, so the rules a change
 * to a job is held to - whose job it is, the tour's reserved ids, the demo job, the provider URLs,
 * the channels a user may send through, how a missing deal type is filled in - are written once.
 *
 * The MCP tools put a job interview in front of {@link saveJob} (`lib/mcp/jobDraftStore.js`), which
 * asks for one answer at a time and words a problem for a model. That interview is for the asking;
 * this save is still what decides whether a job is stored.
 */

import { nanoid } from 'nanoid';
import { getJob, removeJob, setJobStatus, upsertJob } from '../storage/jobStorage.js';
import { getChannel } from '../storage/configuredAdapterStorage.js';
import { getSettings } from '../storage/settingsStorage.js';
import { canModifyJob } from '../security/access.js';
import { canUseChannel } from '../security/channelAccess.js';
import { bus } from '../events/event-bus.js';
import { isRunning } from './run-state.js';
import { providerListProblem } from './providerUrl.js';
import { jobCurrencyProblem } from '../providers/currency.js';
import { isTourJob } from '../tour/tourService.js';
import { isDemoJob } from '../demo/demoService.js';
import { DEAL_TYPES, detectDealTypeForJob, normalizeDealType } from '../dealType.js';
import { normalizeCommuteFilter } from '../../utils/commuteBudget.js';
import { normalizeMarketFilter, normalizePriceChangeThreshold } from '../../utils/marketFilter.js';
import { normalizePaging } from '../../utils/paging.js';
import { getProviders } from '../../utils.js';
import { fail } from '../serviceResult.js';

/**
 * @typedef {import('../serviceResult.js').ServiceFailure} ServiceFailure
 * @typedef {{id: string, isAdmin?: boolean}} User
 */

/**
 * Why a run cannot start from this process. The pipeline is run by the job execution service,
 * which registers its listeners when the Fredy server starts; the standalone MCP server is a side
 * door into the same database with no scheduler attached, and firing an event nobody listens to
 * would answer "started" for a run that never happens.
 */
const NO_RUNNER =
  'Runs are carried out by the running Fredy server, and it is not running in this process - ' +
  'this is the standalone MCP server. Start Fredy, then try again.';

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * Pin whatever the caller sent down to a de-duplicated list of channel ids.
 *
 * Accepting both `['id']` and `[{ configuredAdapterId }]` means the UI, the MCP layer and anyone
 * scripting against the API can all send the shape that is natural to them. The legacy inline shape
 * (`{ id, fields }`) is deliberately dropped rather than migrated on the fly: silently creating a
 * channel from an API call would hide credentials in a place the caller never asked for.
 *
 * @param {unknown} input
 * @returns {string[]}
 */
export function toChannelRefs(input) {
  if (!Array.isArray(input)) return [];
  const ids = input
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry != null && typeof entry === 'object') return entry.configuredAdapterId;
      return null;
    })
    .filter((id) => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)];
}

/**
 * The refusal for the demo instance's example job, which only an admin may change.
 *
 * Checked in that order so the settings are only read for the one job it can be about.
 *
 * @param {User} user
 * @param {{id: string}} job
 * @param {string} message
 * @returns {Promise<ServiceFailure|null>}
 */
async function demoJobRefusal(user, job, message) {
  if (user?.isAdmin === true || !isDemoJob(job.id)) return null;
  return (await getSettings()).demoMode ? fail('forbidden', message, { code: 'demoJob' }) : null;
}

/**
 * The job a user is about to change, or why they may not.
 *
 * `canModifyJob` - owner or admin - is the rule for running, editing, switching and deleting alike:
 * someone a job was shared with may read it and its listings, but it stays its owner's.
 *
 * @param {User} user
 * @param {string} jobId
 * @returns {ServiceFailure|{ok: true, job: Object}}
 */
export function findModifiableJob(user, jobId) {
  const job = getJob(jobId);
  if (job == null) return fail('notFound', 'Job not found.');
  if (!canModifyJob(user, job)) return fail('forbidden', 'This job is not yours to change.', { code: 'notYours' });
  return { ok: true, job };
}

/**
 * Start one job's run now, in the background.
 *
 * @param {User} user
 * @param {string} jobId
 * @returns {ServiceFailure|{ok: true, job: Object}}
 */
export function startJobRun(user, jobId) {
  const found = findModifiableJob(user, jobId);
  if (!found.ok) return found;
  if (isTourJob(jobId)) return fail('conflict', 'The example job of the onboarding tour does not search.');
  if (isRunning(jobId)) {
    return fail('conflict', 'That job is already running. Let it finish before starting it again.');
  }
  if (bus.listenerCount('jobs:runOne') === 0) return fail('unavailable', NO_RUNNER);
  bus.emit('jobs:runOne', { jobId });
  return found;
}

/**
 * Start a run of every job the user may run: every job on the instance for an admin, their own for
 * everyone else. The listener does that scoping, from the user id.
 *
 * @param {User} user
 * @returns {ServiceFailure|{ok: true}}
 */
export function startAllJobRuns(user) {
  if (bus.listenerCount('jobs:runAll') === 0) return fail('unavailable', NO_RUNNER);
  bus.emit('jobs:runAll', { userId: user.id });
  return { ok: true };
}

/**
 * Switch a job on or off. Switching it to the state it is already in is not an error.
 *
 * @param {User} user
 * @param {string} jobId
 * @param {unknown} enabled - Read as a boolean, as the column stores it.
 * @returns {Promise<ServiceFailure|{ok: true, job: Object, enabled: boolean, changed: boolean}>}
 */
export async function setJobEnabled(user, jobId, enabled) {
  const job = getJob(jobId);
  if (job == null) return fail('notFound', 'Job not found.');
  const demo = await demoJobRefusal(user, job, 'Sorry, but you cannot change the Status of our Demo Job ;)');
  if (demo) return demo;
  const found = findModifiableJob(user, jobId);
  if (!found.ok) return found;

  const next = Boolean(enabled);
  const changed = Boolean(job.enabled) !== next;
  if (changed) setJobStatus({ jobId, status: next });
  return { ok: true, job, enabled: next, changed };
}

/**
 * Delete a job and, through the foreign key, every listing it found.
 *
 * @param {User} user
 * @param {string} jobId
 * @param {{dryRun?: boolean}} [options] - `dryRun` runs every check and deletes nothing, for a caller
 *   that asks for confirmation first.
 * @returns {Promise<ServiceFailure|{ok: true, job: Object}>}
 */
export async function deleteJob(user, jobId, { dryRun = false } = {}) {
  const job = getJob(jobId);
  if (job == null) return fail('notFound', 'Job not found.');
  const demo = await demoJobRefusal(user, job, 'Sorry, but you cannot remove the Demo Job ;)');
  if (demo) return demo;
  const found = findModifiableJob(user, jobId);
  if (!found.ok) return found;
  if (!dryRun) removeJob(jobId);
  return { ok: true, job };
}

/**
 * @typedef {Object} JobInput
 * @property {string} [jobId] - The job to update. Left out, or naming no job, creates one.
 * @property {string} [name]
 * @property {boolean} [enabled]
 * @property {Array<{id: string, name?: string, url: string, enabled?: boolean}>} provider
 * @property {Array<string|{configuredAdapterId: string}>} [notificationAdapter] - Channel references.
 * @property {string[]} [blacklist]
 * @property {string[]} [excludedLocations] - Left out keeps the stored list.
 * @property {string[]} [shareWithUsers]
 * @property {Object|null} [spatialFilter]
 * @property {Object|null} [specFilter]
 * @property {Object|null} [commuteFilter]
 * @property {Object|null} [marketFilter]
 * @property {number|null} [priceChangeThreshold]
 * @property {Object|null} [paging] - More than one result page per run; null or left out is one page.
 * @property {string|null} [dealType] - Left out keeps the stored type, or is worked out from the URLs.
 */

/**
 * Validate and store a job, created or updated. Every value is checked before anything is stored.
 *
 * The owner of an existing job stays its owner whoever saves it (`upsertJob` keeps it); a new job
 * belongs to the user creating it.
 *
 * @param {User} user
 * @param {JobInput} input
 * @returns {Promise<ServiceFailure|{ok: true, jobId: string, created: boolean}>}
 */
export async function saveJob(user, input) {
  const {
    jobId = null,
    provider,
    notificationAdapter,
    name,
    blacklist = [],
    excludedLocations,
    enabled,
    shareWithUsers = [],
    spatialFilter = null,
    specFilter = null,
    commuteFilter = null,
    marketFilter = null,
    priceChangeThreshold = null,
    paging = null,
    dealType = null,
  } = input ?? {};

  const existing = jobId ? getJob(jobId) : null;
  if (existing && !canModifyJob(user, existing)) {
    return fail('forbidden', 'You are trying to change a job that is not associated to your user.', {
      code: 'notYours',
    });
  }
  // The id is taken from the caller when no job has it yet, so without this a job could be created
  // under the tour prefix - and would then never run and be deleted by the tour cleanup.
  if (!existing && isTourJob(jobId)) return fail('invalid', 'This job id is reserved.');
  if (existing) {
    const demo = await demoJobRefusal(user, existing, 'Sorry, but you cannot change the Status of our Demo Job ;)');
    if (demo) return demo;
  }

  // Checked before anything is stored: every consumer of a job treats these as arrays, and the
  // pipeline opens each provider URL in a real browser.
  const providerMeta = new Map(
    (await getProviders()).map((module) => [module?.metaInformation?.id, module?.metaInformation]),
  );
  const providerProblem =
    providerListProblem(provider, providerMeta) ?? jobCurrencyProblem(provider, providerMeta, specFilter);
  if (providerProblem != null) return fail('invalid', providerProblem);
  if (!isStringArray(blacklist) || !isStringArray(shareWithUsers)) {
    return fail('invalid', 'blacklist and shareWithUsers must be arrays of strings.');
  }
  if (excludedLocations !== undefined && !isStringArray(excludedLocations)) {
    return fail('invalid', 'excludedLocations must be an array of strings.');
  }

  // Jobs reference channels rather than carrying their configuration. Without this check any user
  // could attach an admin-only channel by naming its id.
  const channelRefs = toChannelRefs(notificationAdapter);
  for (const channelId of channelRefs) {
    const channel = getChannel(channelId);
    if (channel == null) return fail('invalid', `Unknown notification channel: ${channelId}`);
    if (!canUseChannel(user, channel)) {
      return fail('forbidden', 'You are not allowed to use one of the selected notification channels.');
    }
  }

  const id = existing ? existing.id : jobId || nanoid();
  upsertJob({
    userId: user.id,
    jobId: id,
    enabled,
    name,
    blacklist,
    excludedLocations,
    provider,
    notificationAdapter: channelRefs.map((configuredAdapterId) => ({ configuredAdapterId })),
    shareWithUsers,
    spatialFilter,
    specFilter,
    // Normalised rather than trusted: these can hold back a listing, and the shape that arrives
    // decides whether they hold back the right ones. A filter that would do nothing normalises to
    // null, so an emptied form clears the column instead of storing an object that means the same
    // as not having one.
    commuteFilter: normalizeCommuteFilter(commuteFilter),
    marketFilter: normalizeMarketFilter(marketFilter),
    priceChangeThreshold: normalizePriceChangeThreshold(priceChangeThreshold),
    // Bounded rather than trusted: the page count decides how many requests a run sends a portal.
    paging: normalizePaging(paging),
    // The UI always sends the deal type. A job saved without one keeps the stored type, or is
    // classified from its search URLs, and falls back to renting, which most Fredy jobs look for.
    dealType: normalizeDealType(dealType) ?? existing?.dealType ?? detectDealTypeForJob(provider) ?? DEAL_TYPES.RENT,
  });
  return { ok: true, jobId: id, created: existing == null };
}
