/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const storagePath = root + '/lib/services/storage/listingsStorage.js';
const utilsPath = root + '/lib/utils.js';
const loggerPath = root + '/lib/services/logger.js';

let state;

/**
 * Load the alive-checker with its storage and provider lookup replaced.
 *
 * @param {(link: string) => number} [activeTester] The provider probe. Defaults to "still online".
 * @returns {Promise<Function>} runActiveChecker
 */
async function loadService(activeTester = (link) => state.testerResults[link] ?? 1) {
  vi.resetModules();
  vi.doMock(storagePath, () => ({
    getListingsDueForActiveCheck: () => state.due,
    deactivateListings: (ids) => state.deactivated.push(...ids),
    markListingsChecked: (ids) => state.marked.push(...ids),
    recordActiveCheckFailures: (ids) => {
      state.failuresRecorded.push(...ids);
      return state.exhausted;
    },
  }));
  vi.doMock(utilsPath, () => ({
    getProviders: async () => [{ metaInformation: { id: 'immowelt' }, config: { activeTester } }],
  }));
  vi.doMock(loggerPath, () => ({
    default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  }));
  return (await import(root + '/lib/services/listings/listingActiveService.js')).default;
}

const listing = (id) => ({ id, link: `https://example.com/${id}`, provider: 'immowelt' });

/**
 * The two outcomes that matter for retention: a listing the portal reports as gone starts its grace
 * period straight away, while a probe that never answers only counts towards a streak - a blocked IP
 * must not be read as "this flat is gone".
 */
describe('services/listings/listingActiveService', () => {
  beforeEach(() => {
    state = { due: [], testerResults: {}, deactivated: [], marked: [], failuresRecorded: [], exhausted: [] };
  });

  it('deactivates a listing the provider reports as gone', async () => {
    state.due = [listing('gone')];
    state.testerResults['https://example.com/gone'] = 0;
    const runActiveChecker = await loadService();

    await runActiveChecker();

    expect(state.deactivated).toEqual(['gone']);
    expect(state.marked).toEqual(['gone']);
    expect(state.failuresRecorded).toEqual([]);
  });

  it('leaves a listing that is still online alone', async () => {
    state.due = [listing('alive')];
    const runActiveChecker = await loadService();

    await runActiveChecker();

    expect(state.deactivated).toEqual([]);
    expect(state.marked).toEqual(['alive']);
  });

  it('counts a failed probe instead of marking the listing as checked', async () => {
    // markListingsChecked would clear the streak, which is exactly what a failed probe must not do.
    state.due = [listing('blocked')];
    state.testerResults['https://example.com/blocked'] = -1;
    const runActiveChecker = await loadService();

    await runActiveChecker();

    expect(state.failuresRecorded).toEqual(['blocked']);
    expect(state.marked).toEqual([]);
    expect(state.deactivated).toEqual([]);
  });

  it('counts a probe that threw as a failure', async () => {
    // A thrown error is the common shape of a dropped connection or a blocked address.
    state.due = [listing('boom')];
    const runActiveChecker = await loadService(() => {
      throw new Error('ECONNRESET');
    });

    await runActiveChecker();

    expect(state.failuresRecorded).toEqual(['boom']);
    expect(state.marked).toEqual([]);
    expect(state.deactivated).toEqual([]);
  });

  it('deactivates a listing whose failure streak reached the limit', async () => {
    state.due = [listing('hopeless')];
    state.testerResults['https://example.com/hopeless'] = -1;
    state.exhausted = ['hopeless'];
    const runActiveChecker = await loadService();

    await runActiveChecker();

    // Enough failed probes in a row: the portal keeps refusing to answer, so the listing counts as
    // gone and its retention period starts.
    expect(state.deactivated).toEqual(['hopeless']);
  });

  it('keeps the two outcomes apart within one run', async () => {
    state.due = [listing('gone'), listing('alive'), listing('blocked')];
    state.testerResults['https://example.com/gone'] = 0;
    state.testerResults['https://example.com/blocked'] = -1;
    const runActiveChecker = await loadService();

    await runActiveChecker();

    expect(state.deactivated).toEqual(['gone']);
    expect(state.marked.sort()).toEqual(['alive', 'gone']);
    expect(state.failuresRecorded).toEqual(['blocked']);
  });

  it('does nothing when no listing is due', async () => {
    const runActiveChecker = await loadService();

    await runActiveChecker();

    expect(state.deactivated).toEqual([]);
    expect(state.marked).toEqual([]);
    expect(state.failuresRecorded).toEqual([]);
  });
});
