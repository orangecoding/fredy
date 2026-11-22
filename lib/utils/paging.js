/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * How many result pages a job reads per provider and run, and how long it waits between two.
 *
 * Every job reads one page unless its owner asks for more. One page was the only behaviour for a
 * long time, on purpose: each further page is one more request against a portal that rate-limits
 * (the ImmoScout mobile API answers bursts with 429), so the job form only offers more pages behind
 * a warning, and the wait between two of them is the owner's to choose.
 */

/** The most pages a run may read. Ten pages of ImmoScout are a thousand adverts. */
export const MAX_PAGES = 10;

/** Upper bound for the wait and for the jitter, in seconds. Beyond it a run would stall the round. */
export const MAX_WAIT_SECONDS = 600;

/**
 * @typedef {Object} Paging
 * @property {number} pages How many result pages a run reads, 2 to {@link MAX_PAGES}.
 * @property {number} waitSeconds Fixed pause before every page after the first, in seconds.
 * @property {number} jitterSeconds Random extra pause on top of `waitSeconds`, 0 to this many seconds.
 */

/**
 * A whole number of seconds within bounds.
 *
 * @param {unknown} value
 * @returns {number} 0 for anything absent, negative or unparseable.
 */
function toSeconds(value) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds, MAX_WAIT_SECONDS);
}

/**
 * A job's stored paging, reduced to something safe to act on.
 *
 * @param {unknown} raw As stored on the job, or as posted by a client.
 * @returns {Paging|null} `null` for one page, which is what every job without a setting reads, so a
 *   form set back to one page clears the column instead of storing an object that means the same.
 */
export function normalizePaging(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const pages = Math.round(Number(raw.pages));
  if (!Number.isFinite(pages) || pages <= 1) {
    return null;
  }
  return {
    pages: Math.min(pages, MAX_PAGES),
    waitSeconds: toSeconds(raw.waitSeconds),
    jitterSeconds: toSeconds(raw.jitterSeconds),
  };
}

/**
 * The pause before one further page, in milliseconds.
 *
 * @param {Paging} paging
 * @param {() => number} [random] Source of randomness, for tests.
 * @returns {number}
 */
export function pageDelayMs(paging, random = Math.random) {
  return (paging.waitSeconds + random() * paging.jitterSeconds) * 1000;
}
