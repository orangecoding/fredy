/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const utilsPath = root + '/lib/utils.js';

/** Every wait the probe takes, so pacing can be asserted without spending the time. */
let waited;
let fetchMock;
let originalFetch;

/**
 * Load the immoscout provider with its network and its waits replaced.
 * @returns {Promise<Function>} The provider's `activityProbe`.
 */
async function loadProbe() {
  vi.resetModules();
  waited = [];
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock;

  vi.doMock(utilsPath, async (importOriginal) => ({
    ...(await importOriginal()),
    sleep: async (ms) => {
      waited.push(ms);
    },
  }));

  const provider = await import(root + '/lib/provider/immoscout.js');
  return provider.config.activityProbe;
}

/**
 * @param {number} status
 * @param {string | null} [retryAfter] Value of the `Retry-After` header.
 */
const response = (status, retryAfter = null) => ({
  status,
  headers: { get: (name) => (name.toLowerCase() === 'retry-after' ? retryAfter : null) },
});

const LINK = 'https://www.immobilienscout24.de/expose/170704478';
const MOBILE_LINK = 'https://api.mobile.immobilienscout24.de/expose/170704478';

/**
 * Immoscout answers the alive-check from its mobile JSON API rather than from a website, so it
 * brings its own probe instead of using the shared one. That probe used to be a single bare fetch -
 * no pacing, no retry, no idea what a 429 meant - which is how a nightly run turned into a page of
 * "Unknown status ... 429" warnings and, ten runs later, deactivated listings that were still live.
 */
describe('#immoscout activityProbe()', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('asks the mobile API for the listing, as the app does', async () => {
    const activityProbe = await loadProbe();
    fetchMock.mockResolvedValue(response(200));

    await expect(activityProbe(LINK)).resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      MOBILE_LINK,
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('ImmoScout') }),
      }),
    );
  });

  it('reports a listing the API no longer knows as gone', async () => {
    const activityProbe = await loadProbe();
    fetchMock.mockResolvedValue(response(404));

    await expect(activityProbe(LINK)).resolves.toBe(0);
    // 404 is an answer, not a failure - there is nothing to retry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('waits a little before the first request', async () => {
    const activityProbe = await loadProbe();
    fetchMock.mockResolvedValue(response(200));

    await activityProbe(LINK);

    // The checker runs these back to back; without the jitter a batch leaves as one burst.
    expect(waited).toHaveLength(1);
    expect(waited[0]).toBeGreaterThanOrEqual(50);
    expect(waited[0]).toBeLessThanOrEqual(100);
  });

  describe('rate limiting', () => {
    it('never reads a 429 as "this listing is gone"', async () => {
      const activityProbe = await loadProbe();
      fetchMock.mockResolvedValue(response(429));

      await expect(activityProbe(LINK)).resolves.toBe(-1);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('waits as long as the portal asked before trying again', async () => {
      const activityProbe = await loadProbe();
      fetchMock.mockResolvedValueOnce(response(429, '3')).mockResolvedValueOnce(response(200));

      await expect(activityProbe(LINK)).resolves.toBe(1);
      expect(waited).toContain(3000);
    });

    it('recovers when the portal lets the next attempt through', async () => {
      const activityProbe = await loadProbe();
      fetchMock.mockResolvedValueOnce(response(429)).mockResolvedValueOnce(response(200));

      await expect(activityProbe(LINK)).resolves.toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('retries an unreadable status before giving up on it', async () => {
    const activityProbe = await loadProbe();
    fetchMock.mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200));

    await expect(activityProbe(LINK)).resolves.toBe(1);
  });

  it('counts a network error as a failed probe instead of throwing at the checker', async () => {
    const activityProbe = await loadProbe();
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    await expect(activityProbe(LINK)).resolves.toBe(-1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up on a link it cannot turn into a mobile API url', async () => {
    const activityProbe = await loadProbe();

    await expect(activityProbe(null)).resolves.toBe(-1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
