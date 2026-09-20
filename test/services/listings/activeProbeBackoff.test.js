/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_PROBE_ATTEMPTS,
  MAX_RETRY_AFTER_MS,
  backoffDelay,
  retryAfterDelay,
} from '../../../lib/services/listings/activeProbeBackoff.js';

/**
 * The waits an alive-probe puts between its attempts. Split out of the probes themselves because
 * immoscout speaks to a JSON API and everyone else to a website, so the two probes share nothing
 * but this - and the one that did not have it is what turned a rate limit into a warning storm.
 */
describe('services/listings/activeProbeBackoff', () => {
  const headers = (value) => ({ headers: { get: (name) => (name.toLowerCase() === 'retry-after' ? value : null) } });

  describe('backoffDelay', () => {
    it('grows exponentially', () => {
      // Jitter is added on top, so each attempt is compared against its own floor.
      expect(backoffDelay(1)).toBeGreaterThanOrEqual(500);
      expect(backoffDelay(2)).toBeGreaterThanOrEqual(1000);
      expect(backoffDelay(3)).toBeGreaterThanOrEqual(2000);
    });

    it('stays capped however many attempts went before', () => {
      // Without a cap the tenth attempt would wait over four minutes.
      expect(backoffDelay(10)).toBeLessThanOrEqual(2000 + 1000);
    });
  });

  describe('retryAfterDelay', () => {
    it('waits as long as the portal asked when Retry-After is a number of seconds', () => {
      expect(retryAfterDelay(headers('2'), 1)).toBe(2000);
    });

    it('accepts Retry-After as an HTTP date', () => {
      const inFiveSeconds = new Date(Date.now() + 5000).toUTCString();
      // Whole-second resolution in the header, so the result lands in a window rather than on a value.
      expect(retryAfterDelay(headers(inFiveSeconds), 1)).toBeGreaterThan(3500);
      expect(retryAfterDelay(headers(inFiveSeconds), 1)).toBeLessThanOrEqual(5000);
    });

    it('never waits longer than the cap, whatever the portal asks for', () => {
      // A portal answering "come back in an hour" must not hold a nightly run open for an hour.
      expect(retryAfterDelay(headers('3600'), 1)).toBe(MAX_RETRY_AFTER_MS);
    });

    it('treats a date in the past as no wait at all', () => {
      expect(retryAfterDelay(headers(new Date(Date.now() - 60_000).toUTCString()), 1)).toBe(0);
    });

    it('falls back to the plain backoff when the header is missing or unreadable', () => {
      expect(retryAfterDelay(headers(null), 2)).toBeGreaterThanOrEqual(1000);
      expect(retryAfterDelay(headers('soon'), 2)).toBeGreaterThanOrEqual(1000);
      expect(retryAfterDelay({}, 2)).toBeGreaterThanOrEqual(1000);
    });
  });

  it('gives every probe the same number of attempts', () => {
    expect(MAX_PROBE_ATTEMPTS).toBe(3);
  });
});
