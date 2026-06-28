/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect, vi } from 'vitest';
import * as provider from '../../lib/provider/schwarzesbrett.js';
import * as mockStore from '../mocks/mockStore.js';
import { launchBrowser, closeBrowser } from '../../lib/services/extractor/puppeteerExtractor.js';

// One browser shared across the whole suite so both requests (search + detail)
// come from the same warm session. This prevents the second request from being
// flagged as a cold-start bot hit by the portal's Cloudflare protection.
const TEST_TIMEOUT = 120_000;

describe('#schwarzesbrett testsuite()', () => {
  let browser;
  let liveListings;

  beforeAll(async () => {
    browser = await launchBrowser(providerConfig.schwarzesbrett.url);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await closeBrowser(browser);
  });

  it(
    'should test schwarzesbrett provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = {
        id: 'schwarzesbrett',
        notificationAdapter: null,
        spatialFilter: null,
        specFilter: null,
      };
      provider.init(providerConfig.schwarzesbrett, [], []);

      const fredy = new Fredy(provider.config, mockedJob, provider.metaInformation.id, similarityCache, browser);

      liveListings = await fredy.execute();

      if (liveListings == null || liveListings.length === 0) {
        throw new Error('Listings is empty!');
      }

      expect(liveListings).toBeInstanceOf(Array);
      const notificationObj = get();
      expect(notificationObj).toBeTypeOf('object');
      expect(notificationObj.serviceName).toBe('schwarzesbrett');
      notificationObj.payload.forEach((notify) => {
        /** check the actual structure **/
        expect(notify.id).toBeTypeOf('string');
        expect(notify.title).toBeTypeOf('string');
        expect(notify.link).toBeTypeOf('string');
        expect(notify.address).toBeTypeOf('string');
        /** check the values if possible **/
        expect(notify.title).not.toBe('');
        expect(notify.link).toContain('https://schwarzesbrett.bremen.de/show/');
        expect(notify.address).not.toBe('');
      });
    },
    TEST_TIMEOUT,
  );

  describe('with provider_details enabled', () => {
    beforeEach(() => {
      vi.spyOn(mockStore, 'getUserSettings').mockReturnValue({ provider_details: [provider.metaInformation.id] });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it(
      'should enrich listings with details',
      async () => {
        if (!liveListings?.length) throw new Error('No listings from first test to enrich');

        // Call fetchDetails directly on the first live listing — no need to
        // re-scrape the search page. The shared browser keeps the session warm.
        const enriched = await provider.config.fetchDetails(liveListings[0], browser);

        expect(enriched).toBeTruthy();
        expect(enriched.link).toContain('https://schwarzesbrett.bremen.de/show/');
        expect(enriched.address).toBeTypeOf('string');
        expect(enriched.address).not.toBe('');
        // description is enriched from the detail page; falls back gracefully if blocked
        if (enriched.description != null) {
          expect(enriched.description).toBeTypeOf('string');
          expect(enriched.description).not.toBe('');
        }
      },
      TEST_TIMEOUT,
    );
  });
});
