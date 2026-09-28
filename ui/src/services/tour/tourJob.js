/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Prefix of the onboarding tour's example job id. Mirrors `isTourJob` in
 * `lib/services/tour/tourService.js`, where the server reserves it.
 */
const TOUR_JOB_PREFIX = 'tour-';

/**
 * True when a job is the onboarding tour's example job.
 *
 * That job is paused on purpose and has no notification channel, and it disappears again when the
 * tour ends. Anything that judges jobs on either of those, such as the dashboard's attention list,
 * has to leave it alone, or the tour's first stop is a warning about the tour itself.
 *
 * @param {string|null|undefined} jobId
 * @returns {boolean}
 */
export function isTourJobId(jobId) {
  return typeof jobId === 'string' && jobId.startsWith(TOUR_JOB_PREFIX);
}
