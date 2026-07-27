/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { providerConfig, mockFredy } from '../utils.js';
import { expect } from 'vitest';
import * as provider from '../../lib/provider/imaxx.js';
import { launchBrowser, closeBrowser } from '../../lib/services/extractor/puppeteerExtractor.js';

// One browser shared across the whole suite so both requests (search + detail)
// come from the same warm session.
const TEST_TIMEOUT = 120_000;

describe('#imaxx testsuite()', () => {
  provider.init(providerConfig.imaxx, []);

  let browser;
  let listings;

  beforeAll(async () => {
    browser = await launchBrowser(providerConfig.imaxx.url);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await closeBrowser(browser);
  });

  it(
    'should test imaxx provider',
    async () => {
      const mockedJob = {
        id: 'imaxx',
        notificationAdapter: null,
        spatialFilter: null,
        specFilter: null,
      };

      const Fredy = await mockFredy();
      const fredy = new Fredy(provider.config, mockedJob, provider.metaInformation.id, similarityCache, browser);
      listings = await fredy.execute();

      if (listings == null || listings.length === 0) {
        throw new Error('Listings is empty!');
      }

      expect(listings).toBeInstanceOf(Array);
      const notificationObj = get();
      expect(notificationObj).toBeTypeOf('object');
      expect(notificationObj.serviceName).toBe('imaxx');
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
        expect(notify.link).toContain('https://www.imaxx.de/immobilien/');
        expect(notify.address).not.toBe('');
      });
    },
    TEST_TIMEOUT,
  );

  describe('with provider_details enabled', () => {
    it(
      'should enrich listings with the exposé description',
      async () => {
        if (!listings?.length) throw new Error('No listings from first test to enrich');

        // fetchDetails is called directly on an already scraped listing, so the search page
        // does not have to be crawled a second time.
        const enriched = await provider.config.fetchDetails(listings[0], browser);

        expect(enriched.link).toBe(listings[0].link);
        expect(enriched.address).toBeTypeOf('string');
        expect(enriched.address).not.toBe('');
        expect(enriched.description).toBeTypeOf('string');
        expect(enriched.description.length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );
  });
});
