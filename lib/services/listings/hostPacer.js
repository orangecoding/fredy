/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { sleep } from '../../utils.js';

/**
 * Default floor on the time between two requests at the same host (~3 requests a second).
 * @type {number}
 */
export const DEFAULT_HOST_GAP_MS = 350;

/**
 * The bucket a link that has no readable host is queued in.
 * @type {string}
 */
const UNKNOWN_HOST = '<unknown>';

/**
 * @param {string | null | undefined} url
 * @returns {string} The host to queue this request under.
 */
function hostKeyOf(url) {
  try {
    return new URL(String(url)).host || UNKNOWN_HOST;
  } catch {
    return UNKNOWN_HOST;
  }
}

/**
 * Builds a "one request at a time, and not too quickly" gate keyed by host.
 *
 * The alive-checker runs several probes in parallel, and because listings come out of the database
 * ordered by age rather than by portal, those parallel probes are regularly all aimed at the same
 * host. That is a burst - eight requests inside one second at `immobilienscout24.de` is what the
 * HTTP 429s came from - and no amount of per-request backoff helps, because each probe only ever
 * sees its own attempts. Serialising per host keeps the concurrency useful across portals while
 * leaving every single portal a queue of one.
 *
 * The clock and the sleep are injectable so tests do not wait on real timers.
 *
 * @param {object} [options]
 * @param {number} [options.minGapMs=DEFAULT_HOST_GAP_MS] Floor on the time between two request starts
 *   at one host. `0` serialises without pacing.
 * @param {() => number} [options.now] Clock, for tests.
 * @param {(ms: number) => Promise<void>} [options.sleep] Wait helper, for tests.
 * @returns {<T>(url: string | null | undefined, task: () => Promise<T>) => Promise<T>} The gate.
 */
export function createHostPacer({ minGapMs = DEFAULT_HOST_GAP_MS, now = () => Date.now(), sleep: wait = sleep } = {}) {
  /** Tail of each host's queue. A request is chained onto it, so only one runs at a time. */
  const queues = new Map();
  /** When the last request at a host started, which is what the gap is measured from. */
  const startedAt = new Map();

  return function pace(url, task) {
    const host = hostKeyOf(url);
    const previous = queues.get(host) ?? Promise.resolve();

    const result = previous.then(async () => {
      const last = startedAt.get(host);
      if (last != null) {
        // Measured from the previous *start*, so a portal that answers slowly is not paced twice.
        const remaining = minGapMs - (now() - last);
        if (remaining > 0) await wait(remaining);
      }
      startedAt.set(host, now());
      return task();
    });

    // The queue is chained on a settled promise: one failing probe must reach its caller without
    // taking the rest of that host's queue down with it.
    queues.set(
      host,
      result.then(
        () => {},
        () => {},
      ),
    );
    return result;
  };
}
