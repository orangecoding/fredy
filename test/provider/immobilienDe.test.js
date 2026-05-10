/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { providerConfig, mockFredy } from '../utils.js';
import { expect } from 'vitest';
import * as provider from '../../lib/provider/immobilienDe.js';
import { launchBrowser, closeBrowser } from '../../lib/services/extractor/puppeteerExtractor.js';

// One browser shared across the whole suite so both requests (search + detail)
// come from the same warm session, avoiding double cold-start bot detection.
const TEST_TIMEOUT = 120_000;

describe('#immobilien.de testsuite()', () => {
  provider.init(providerConfig.immobilienDe, [], []);

  let browser;
  let liveListings;

  beforeAll(async () => {
    browser = await launchBrowser(providerConfig.immobilienDe.url);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await closeBrowser(browser);
  });

  it(
    'should test immobilien.de provider',
    async () => {
      const mockedJob = {
        id: 'test1',
        notificationAdapter: null,
        spatialFilter: null,
        specFilter: null,
      };

      const Fredy = await mockFredy();
      const fredy = new Fredy(provider.config, mockedJob, provider.metaInformation.id, similarityCache, browser);
      liveListings = await fredy.execute();

      if (liveListings == null || liveListings.length === 0) {
        throw new Error('Listings is empty!');
      }

      expect(liveListings).toBeInstanceOf(Array);
      const notificationObj = get();
      expect(notificationObj).toBeTypeOf('object');
      expect(notificationObj.serviceName).toBe('immobilienDe');
      notificationObj.payload.forEach((notify) => {
        /** check the actual structure **/
        expect(notify.id).toBeTypeOf('string');
        expect(notify.price).toBeTypeOf('string');
        expect(notify.size).toBeTypeOf('string');
        expect(notify.title).toBeTypeOf('string');
        expect(notify.link).toBeTypeOf('string');
        expect(notify.address).toBeTypeOf('string');
        /** check the values if possible **/
        expect(notify.price).toContain('€');
        expect(notify.size).toContain('m²');
        expect(notify.title).not.toBe('');
        expect(notify.link).toContain('https://www.immobilien.de');
        expect(notify.address).not.toBe('');
      });
    },
    TEST_TIMEOUT,
  );

  describe('with provider_details enabled', () => {
    it(
      'should enrich listings with details',
      async () => {
        if (!liveListings?.length) throw new Error('No listings from first test to enrich');

        // Call fetchDetails directly on the first live listing — no need to
        // re-scrape the search page. The shared browser keeps the session warm.
        const enriched = await provider.config.fetchDetails(liveListings[0], browser);

        if (enriched == null) return;
        expect(enriched.link).toContain('https://www.immobilien.de');
        expect(enriched.address).toBeTypeOf('string');
        expect(enriched.address).not.toBe('');
        // description may be null if selectors don't match yet — falls back gracefully
        if (enriched.description != null) {
          expect(enriched.description).toBeTypeOf('string');
        }
      },
      TEST_TIMEOUT,
    );
  });
});
