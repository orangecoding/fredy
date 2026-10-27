/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getProviders } from '../../utils.js';
import { launchBrowser, closeBrowser } from '../extractor/puppeteerExtractor.js';
import { getSettings } from '../storage/settingsStorage.js';
import { getJob } from '../storage/jobStorage.js';
import { getListingsByLinkForUser, restoreListingsById } from '../storage/listingsStorage.js';
import { ensureWatch } from '../storage/watchListStorage.js';
import { canModifyJob } from '../security/access.js';
import { isPubliclyFetchableUrl } from '../security/outboundUrl.js';
import { resolveProviderForUrl } from '../jobs/providerUrl.js';
import { isTourJob } from '../tour/tourService.js';
import { isDemoJob } from '../demo/demoService.js';
import * as similarityCache from '../similarity-check/similarityCache.js';
import FredyPipelineExecutioner from '../../FredyPipelineExecutioner.js';
import logger from '../logger.js';

/** @import { ParsedListing } from '../../types/listing.js' */

/**
 * Adding one listing by pasting its URL, outside any job run.
 *
 * The listing is stored under a job the user picks, not beside the jobs. Everything a listing is
 * given after it is found keys on its job: who may see it, whether it is a rent or a sale, the
 * addresses its distances and travel times are measured to, the market it is compared against, the
 * channels a price drop is announced on. Under a job it gets all of that from the code that already
 * does it, and a later run of the same job recognises it rather than storing it a second time.
 *
 * What the provider has to supply is `fetchListingByUrl`: the exposé read into a complete listing.
 * A provider without it is "not supported yet", which is a fact about Fredy rather than about the
 * URL, and the answer says so.
 */

/**
 * What the caller can be told.
 *
 * - `created`: stored, `listingId` names the row. Also the answer when the job held the advert
 *   soft-deleted and it was restored, which is what the user asked for.
 * - `duplicate`: the user can already open this advert, `listingId` names it.
 * - `invalidUrl`: not a URL Fredy may fetch at all.
 * - `forbidden`: no such job, or not one this user may add to.
 * - `unknownPortal`: no provider serves this host.
 * - `unsupported`: the provider exists, but cannot read a single advert yet.
 * - `unreadable`: the provider read the page and found no advert in it (a search, a bot wall, gone).
 * - `project`: the page is a new-build project with several units, not one advert.
 * - `busy`: this user already has an add running.
 * - `failed`: something broke on the way, see the log.
 *
 * @typedef {'created'|'duplicate'|'invalidUrl'|'forbidden'|'unknownPortal'|'unsupported'|'unreadable'|'project'|'busy'|'failed'} AddListingStatus
 */

/**
 * @typedef {Object} AddListingResult
 * @property {AddListingStatus} status
 * @property {string} [listingId] For `created` and `duplicate`.
 * @property {string|null} [jobName] For `duplicate`: which job already holds it.
 * @property {string} [provider] The provider id, once the host named one.
 */

/**
 * Users with an add in flight. One at a time each, because each may start a Chromium, and a double
 * click must not start two. Per process and in memory, like the detail refetch guard next door.
 *
 * @type {Set<string>}
 */
const inFlight = new Set();

/**
 * Whether a provider returned something that can be stored as a listing.
 *
 * @param {ParsedListing|null|undefined} listing
 * @returns {boolean}
 */
function isComplete(listing) {
  return ['id', 'link', 'title'].every((key) => typeof listing?.[key] === 'string' && listing[key].trim().length > 0);
}

/**
 * Read the exposé through the provider, with a browser only when the provider uses one.
 *
 * @param {Object} provider A provider module.
 * @param {string} url
 * @returns {Promise<{listing: ParsedListing|null, browser: any}>} The browser is handed back open,
 *   because the pipeline steps run next and the caller closes it.
 */
async function readListing(provider, url) {
  const settings = await getSettings();
  const browser =
    provider.config.needsBrowser === false ? undefined : await launchBrowser(url, { proxyUrl: settings.proxyUrl });
  try {
    return { listing: await provider.config.fetchListingByUrl(url, browser), browser };
  } catch (error) {
    if (browser) await closeBrowser(browser).catch(() => {});
    throw error;
  }
}

/**
 * An existing listing the user can open, or a soft-deleted copy in the target job brought back.
 *
 * @param {string} providerId
 * @param {string} link
 * @param {string} userId
 * @param {string} jobId
 * @returns {AddListingResult|null} Null when the advert is not in Fredy for this user.
 */
function existingListing(providerId, link, userId, jobId) {
  const rows = getListingsByLinkForUser(providerId, link, userId, jobId);
  const visible = rows.find((row) => !row.manually_deleted);
  if (visible) {
    return { status: 'duplicate', listingId: visible.id, jobName: visible.job_name ?? null, provider: providerId };
  }
  // Deleted in this very job. A fresh insert would land on the same row through the job's unique
  // hash and leave it deleted, so the paste would seem to do nothing. Restoring is what was meant.
  const deletedHere = rows.find((row) => row.job_id === jobId);
  if (deletedHere) {
    restoreListingsById([deletedHere.id]);
    return { status: 'created', listingId: deletedHere.id, provider: providerId };
  }
  return null;
}

/**
 * Add one listing from its URL to one of the user's jobs.
 *
 * @param {Object} params
 * @param {{id: string, isAdmin?: boolean}} params.user The acting user.
 * @param {string} params.url The pasted URL.
 * @param {string} params.jobId The job to store it under.
 * @param {boolean} [params.watch] Put it on the user's watch list as well.
 * @returns {Promise<AddListingResult>}
 */
export async function addListingByUrl({ user, url, jobId, watch = false }) {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!isPubliclyFetchableUrl(trimmed)) {
    return { status: 'invalidUrl' };
  }

  const job = jobId ? getJob(jobId) : null;
  // The tour and demo jobs are Fredy's own, rebuilt or wiped on their own schedule, and a listing
  // added to one would disappear with it.
  if (job == null || isTourJob(job.id) || isDemoJob(job.id) || !canModifyJob(user, job)) {
    return { status: 'forbidden' };
  }

  const providers = await getProviders();
  const provider = resolveProviderForUrl(
    trimmed,
    providers.map((module) => module.metaInformation),
  );
  if (provider == null) {
    return { status: 'unknownPortal' };
  }
  const module = providers.find((candidate) => candidate.metaInformation.id === provider.id);
  if (typeof module?.config?.fetchListingByUrl !== 'function') {
    return { status: 'unsupported', provider: provider.id };
  }

  if (inFlight.has(user.id)) {
    return { status: 'busy', provider: provider.id };
  }
  inFlight.add(user.id);

  let browser;
  try {
    // Before any request: the same paste twice should not cost the portal a second visit.
    const pasted = existingListing(provider.id, trimmed, user.id, job.id);
    if (pasted) return finish(pasted, user, watch);

    // A new-build project's page holds no single advert, so there is nothing to read. Said as what it
    // is, because "no listing on this page" reads as if the page were offline.
    if (module.config.isProjectUrl?.(trimmed)) {
      return { status: 'project', provider: provider.id };
    }

    const read = await readListing(module, trimmed);
    browser = read.browser;
    if (!isComplete(read.listing)) {
      return { status: 'unreadable', provider: provider.id };
    }

    // Again on the link the provider settled on, which drops the tracking parameters a shared link
    // tends to carry and is the spelling a job run stores.
    const known = existingListing(provider.id, read.listing.link, user.id, job.id);
    if (known) return finish(known, user, watch);

    // The static config, not `createConfig`: that one binds a search URL and, for idealista and
    // immowelt, validates it, which an exposé URL would fail. Nothing here writes to it.
    const [stored] = await new FredyPipelineExecutioner(
      module.config,
      job,
      provider.id,
      similarityCache,
      browser,
    ).ingest([{ ...read.listing, addedManually: true }]);

    return finish({ status: 'created', listingId: stored.id, provider: provider.id }, user, watch);
  } catch (error) {
    logger.warn(`Could not add the listing at '${trimmed}' (${provider.id}).`, error?.message || error);
    return { status: 'failed', provider: provider.id };
  } finally {
    inFlight.delete(user.id);
    if (browser) await closeBrowser(browser).catch(() => {});
  }
}

/**
 * Watch the listing if asked, for a new one and an existing one alike: "track this advert" is what
 * the user meant either way.
 *
 * @param {AddListingResult} result
 * @param {{id: string}} user
 * @param {boolean} watch
 * @returns {AddListingResult}
 */
function finish(result, user, watch) {
  if (watch && result.listingId) {
    ensureWatch(result.listingId, user.id);
  }
  return result;
}
