/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * How many result pages a job reads per run, as the browser needs to know it.
 *
 * A copy of the bounds in `lib/utils/paging.js`, for the reason `marketFilter.js` is one: the
 * frontend may not reach into server code. The server normalises again on the way in.
 */

/** The most pages the form offers. */
export const MAX_PAGES = 10;

/** The longest wait, and the widest jitter, the form offers, in seconds. */
export const MAX_WAIT_SECONDS = 600;

/** What the wait and the jitter start at when the page count is first raised above one. */
export const DEFAULT_WAIT_SECONDS = 30;
export const DEFAULT_JITTER_SECONDS = 30;

/**
 * A whole number of seconds within bounds.
 *
 * @param {unknown} value
 * @returns {number}
 */
function toSeconds(value) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds, MAX_WAIT_SECONDS);
}

/**
 * The paging a form holds after one of its fields changed.
 *
 * @param {{pages?: number, waitSeconds?: number, jitterSeconds?: number}|null|undefined} current
 * @param {Object} change - The fields that changed.
 * @returns {{pages: number, waitSeconds: number, jitterSeconds: number}|null} `null` for one page,
 *   which is every job's default, so setting the count back to one clears the wait as well.
 */
export function withPagingChange(current, change) {
  const merged = {
    waitSeconds: DEFAULT_WAIT_SECONDS,
    jitterSeconds: DEFAULT_JITTER_SECONDS,
    ...current,
    ...change,
  };
  const pages = Math.min(Math.round(Number(merged.pages)) || 1, MAX_PAGES);
  if (pages <= 1) return null;
  return { pages, waitSeconds: toSeconds(merged.waitSeconds), jitterSeconds: toSeconds(merged.jitterSeconds) };
}
