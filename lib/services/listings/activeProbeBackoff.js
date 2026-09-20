/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { randomBetween } from '../../utils.js';

/**
 * How many times an alive-probe asks before it gives up on a listing.
 * @type {number}
 */
export const MAX_PROBE_ATTEMPTS = 3;

/**
 * Longest wait a `Retry-After` header can buy itself.
 *
 * A portal is free to answer "come back in an hour", and honouring that literally would hold a
 * nightly run open for an hour per rate-limited listing. Past the cap the probe gives up instead and
 * the listing simply stays due, which costs one request on the next run rather than an idle process.
 * @type {number}
 */
export const MAX_RETRY_AFTER_MS = 10_000;

/**
 * Exponential backoff delay with cap and jitter.
 *
 * @param {number} attempt 1-based attempt index
 * @returns {number} delay in ms
 */
export function backoffDelay(attempt) {
  const base = 500;
  const cap = 2000;
  const delay = Math.min(base * 2 ** (attempt - 1), cap);
  return delay + randomBetween(0, 1000);
}

/**
 * How long to wait before retrying a response that asked to be retried.
 *
 * Prefers the portal's own `Retry-After` - in either of the two shapes RFC 9110 allows, a number of
 * seconds or an HTTP date - because guessing against a rate limiter is how a retry turns into a
 * second rate limit. Falls back to {@link backoffDelay} when the header is missing or unreadable,
 * which is the common case: most portals rate-limit without saying for how long.
 *
 * @param {{ headers?: { get?: (name: string) => string | null } }} res The rate-limited response.
 * @param {number} attempt 1-based attempt index, used for the fallback.
 * @returns {number} delay in ms, never above {@link MAX_RETRY_AFTER_MS}
 */
export function retryAfterDelay(res, attempt) {
  const header = res?.headers?.get?.('retry-after');
  if (header == null || String(header).trim() === '') {
    return backoffDelay(attempt);
  }

  const raw = String(header).trim();
  const seconds = Number(raw);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - Date.now();
  if (!Number.isFinite(delay)) {
    return backoffDelay(attempt);
  }

  return Math.min(Math.max(delay, 0), MAX_RETRY_AFTER_MS);
}
