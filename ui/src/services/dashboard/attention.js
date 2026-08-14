/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Jobs that are not doing what their owner thinks they are doing.
 *
 * The dashboard reports totals, and a total is exactly the wrong shape for this: a job switched off
 * three weeks ago, or one that notifies nobody because its only channel was detached, disappears
 * into a count of four jobs and keeps quietly not working. Nothing on the page ever said so.
 *
 * Everything here is read from job data the app has already loaded. No new endpoint, and nothing
 * that needs a per-job run history the client does not have.
 */

/**
 * Why a job was flagged.
 * @type {Readonly<{NO_CHANNEL: 'noChannel', PAUSED: 'paused', NOTHING_FOUND: 'nothingFound'}>}
 */
export const ATTENTION_REASONS = Object.freeze({
  NO_CHANNEL: 'noChannel',
  PAUSED: 'paused',
  NOTHING_FOUND: 'nothingFound',
});

/**
 * Most worth saying first.
 *
 * A job with nowhere to notify runs on every interval, costs requests at the portals, and tells
 * nobody - that is worse than one deliberately switched off. Finding nothing is last: it is often
 * just a narrow search, and it is the only one of the three that might be fine.
 *
 * @type {string[]}
 */
const SEVERITY = [ATTENTION_REASONS.NO_CHANNEL, ATTENTION_REASONS.PAUSED, ATTENTION_REASONS.NOTHING_FOUND];

/**
 * How many to name before summarising the rest. Past a handful this stops being a list of things to
 * do and becomes a second jobs page.
 * @type {number}
 */
export const ATTENTION_LIMIT = 4;

/**
 * The one thing most worth saying about a job, or null when there is nothing to say.
 *
 * @param {Object} job
 * @param {boolean} hasRunOnce Whether the instance has completed a search at all.
 * @returns {string|null}
 */
function reasonFor(job, hasRunOnce) {
  if ((job?.notificationAdapter?.length ?? 0) === 0) {
    return ATTENTION_REASONS.NO_CHANNEL;
  }
  if (job?.enabled === false) {
    return ATTENTION_REASONS.PAUSED;
  }
  // Only once a search has actually happened. A job created a minute ago has found nothing yet
  // because nothing has run, and saying so would be a complaint about the clock.
  if (hasRunOnce && (job?.numberOfFoundListings ?? 0) === 0) {
    return ATTENTION_REASONS.NOTHING_FOUND;
  }
  return null;
}

/**
 * Which jobs want looking at.
 *
 * One reason per job, the most severe. A job that is both paused and empty is one line, not two -
 * the pause explains the emptiness, and saying both would double the length of the list without
 * adding anything to do.
 *
 * @param {Object[]} jobs
 * @param {Object} [options]
 * @param {number|null} [options.lastRun] Epoch ms of the instance's last search.
 * @returns {{id: string, name: string, reason: string}[]} Most severe first, capped at
 *   {@link ATTENTION_LIMIT}; read `countJobsNeedingAttention` for the true total.
 */
export function findJobsNeedingAttention(jobs, { lastRun = null } = {}) {
  return allJobsNeedingAttention(jobs, { lastRun }).slice(0, ATTENTION_LIMIT);
}

/**
 * The same, uncapped.
 *
 * @param {Object[]} jobs
 * @param {Object} [options]
 * @param {number|null} [options.lastRun]
 * @returns {{id: string, name: string, reason: string}[]}
 */
export function allJobsNeedingAttention(jobs, { lastRun = null } = {}) {
  if (!Array.isArray(jobs)) {
    return [];
  }
  const hasRunOnce = lastRun != null && lastRun !== 0;

  return jobs
    .map((job) => ({ id: job?.id, name: job?.name, reason: reasonFor(job, hasRunOnce) }))
    .filter((entry) => entry.reason != null && entry.id != null)
    .sort((a, b) => SEVERITY.indexOf(a.reason) - SEVERITY.indexOf(b.reason));
}

/**
 * How many jobs want looking at, including the ones the list does not name.
 *
 * @param {Object[]} jobs
 * @param {Object} [options]
 * @param {number|null} [options.lastRun]
 * @returns {number}
 */
export function countJobsNeedingAttention(jobs, options) {
  return allJobsNeedingAttention(jobs, options).length;
}
