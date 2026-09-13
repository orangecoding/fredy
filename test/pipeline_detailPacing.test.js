/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockFredy } from './utils.js';
import * as mockStore from './mocks/mockStore.js';

/**
 * The pacing between a batch's detail reads.
 *
 * A run that expanded its search can find a hundred listings at once, and a provider whose detail
 * pages are plain requests would fire a hundred of them as fast as the network allows - which is
 * how a host's abuse wall earns itself and the rest of the batch is stored without what only its
 * detail pages hold. A provider declares its own gait with `detailFetchDelayMs`; one without the
 * field is paced no differently than before.
 */
describe('pipeline detail fetch pacing', () => {
  beforeEach(() => {
    mockStore.resetListings();
    mockStore.setUserSettings({ provider_details: ['paced-provider', 'unpaced-provider'] });
    mockStore.setGeocodeResult(null);
  });

  afterEach(() => {
    mockStore.setUserSettings(null);
  });

  /**
   * @param {string} providerId
   * @param {number} delay
   * @param {number} jitter
   * @param {{at: number, id: string}[]} calls Where each detail read happened on the clock.
   * @returns {Promise<Object>} the executioner, already having run one provider pass
   */
  const runOnePass = async (providerId, delay, jitter, calls) => {
    const Fredy = await mockFredy();
    const providerConfig = {
      url: 'http://example.com',
      getListings: () =>
        Promise.resolve([
          { id: '1', title: 'first', link: 'http://example.com/1' },
          { id: '2', title: 'second', link: 'http://example.com/2' },
          { id: '3', title: 'third', link: 'http://example.com/3' },
        ]),
      normalize: (listing) => listing,
      filter: () => true,
      requiredFieldNames: ['id', 'title', 'link'],
      ...(delay > 0 ? { detailFetchDelayMs: delay, detailFetchJitterMs: jitter } : {}),
      fetchDetails: async (listing) => {
        calls.push({ at: Date.now(), id: listing.id });
        return listing;
      },
    };
    const similarityCache = { checkAndAddEntry: () => false };
    const fredy = new Fredy(
      providerConfig,
      { id: 'job-1', notificationAdapter: null },
      providerId,
      similarityCache,
      undefined,
      { maxDetailFetches: 3 },
    );
    await fredy.execute();
    return fredy;
  };

  it('waits the declared delay between two detail reads', async () => {
    /** @type {{at: number, id: string}[]} */
    const calls = [];
    await runOnePass('paced-provider', 60, 0, calls);

    expect(calls.map((call) => call.id)).toEqual(['1', '2', '3']);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(55);
    expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(55);
  });

  it('paces nothing for a provider that declares no delay', async () => {
    /** @type {{at: number, id: string}[]} */
    const calls = [];
    await runOnePass('unpaced-provider', 0, 0, calls);

    expect(calls.map((call) => call.id)).toEqual(['1', '2', '3']);
  });
});
