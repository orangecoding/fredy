/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const utilsPath = root + '/lib/utils.js';

/** Every wait the tester takes, so the tests can assert on pacing without spending the time. */
let waited;
let fetchMock;

/**
 * Load the shared alive-probe with its network and its waits replaced.
 * @returns {Promise<Function>} checkIfListingIsActive
 */
async function loadTester() {
  vi.resetModules();
  waited = [];
  fetchMock = vi.fn();

  vi.doMock('node-fetch', () => ({ default: fetchMock }));
  vi.doMock(utilsPath, async (importOriginal) => ({
    ...(await importOriginal()),
    sleep: async (ms) => {
      waited.push(ms);
    },
  }));

  return (await import(root + '/lib/services/listings/listingActiveTester.js')).default;
}

/**
 * @param {number} status
 * @param {object} [options]
 * @param {string} [options.retryAfter] Value of the `Retry-After` header.
 * @param {string} [options.body] Response body, for the `checkForText` path.
 */
const response = (status, { retryAfter = null, body = '' } = {}) => ({
  status,
  headers: { get: (name) => (name.toLowerCase() === 'retry-after' ? retryAfter : null) },
  text: async () => body,
});

const LINK = 'https://www.immowelt.de/expose/1';

/**
 * The probe behind every provider that does not bring its own. Its answer decides whether a listing
 * keeps its failure streak or starts a retention period, so the difference between "gone" and "the
 * portal would not talk to me" is the whole contract.
 */
describe('services/listings/listingActiveTester', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reports a listing the portal still serves as online', async () => {
    const checkIfListingIsActive = await loadTester();
    fetchMock.mockResolvedValue(response(200));

    await expect(checkIfListingIsActive(LINK)).resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a listing as gone when the page carries the provider’s "not found" text', async () => {
    const checkIfListingIsActive = await loadTester();
    fetchMock.mockResolvedValue(response(200, { body: '<h1>Angebot nicht gefunden</h1>' }));

    await expect(checkIfListingIsActive(LINK, 'Angebot nicht gefunden')).resolves.toBe(0);
  });

  it('reports a listing as gone on 404 and 410 without retrying', async () => {
    const checkIfListingIsActive = await loadTester();
    fetchMock.mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(410));

    await expect(checkIfListingIsActive(LINK)).resolves.toBe(0);
    await expect(checkIfListingIsActive(LINK)).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports being blocked rather than gone on 401 and 403', async () => {
    const checkIfListingIsActive = await loadTester();
    fetchMock.mockResolvedValue(response(403));

    await expect(checkIfListingIsActive(LINK)).resolves.toBe(-1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  describe('rate limiting', () => {
    it('never reads a 429 as "this listing is gone"', async () => {
      const checkIfListingIsActive = await loadTester();
      fetchMock.mockResolvedValue(response(429));

      // This is the one that mattered: 429 used to fall into the catch-all branch and return 0,
      // which deactivates a listing that is very much still online.
      await expect(checkIfListingIsActive(LINK)).resolves.toBe(-1);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('waits as long as the portal asked before trying again', async () => {
      const checkIfListingIsActive = await loadTester();
      fetchMock.mockResolvedValueOnce(response(429, { retryAfter: '2' })).mockResolvedValueOnce(response(200));

      await expect(checkIfListingIsActive(LINK)).resolves.toBe(1);
      expect(waited).toContain(2000);
    });

    it('recovers when the portal lets the next attempt through', async () => {
      const checkIfListingIsActive = await loadTester();
      fetchMock.mockResolvedValueOnce(response(429)).mockResolvedValueOnce(response(200));

      await expect(checkIfListingIsActive(LINK)).resolves.toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('gives up on an unreadable status rather than guessing', async () => {
    const checkIfListingIsActive = await loadTester();
    fetchMock.mockResolvedValue(response(500));

    await expect(checkIfListingIsActive(LINK)).resolves.toBe(-1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('counts a network error as a failed probe, not as a gone listing', async () => {
    const checkIfListingIsActive = await loadTester();
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    await expect(checkIfListingIsActive(LINK)).resolves.toBe(-1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
