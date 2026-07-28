/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect, vi } from 'vitest';
// Import utils.js before puppeteerExtractor so its offline vi.mock (which stubs
// launchBrowser) is registered first; otherwise offline runs launch a real
// browser and fail when the CloakBrowser binary isn't cached (e.g. in CI).
import { mockFredy, providerConfig } from '../utils.js';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { closeBrowser, launchBrowser } from '../../lib/services/extractor/puppeteerExtractor.js';
import { get } from '../mocks/mockNotification.js';
import * as mockStore from '../mocks/mockStore.js';
import * as provider from '../../lib/provider/inberlinwohnen.js';

/** Run-scoped provider config, built per test via createConfig(). */
let runConfig;

// The portal renders every result page server side, so a single run walks
// through all pages of the search. One shared browser keeps that session warm.
const TEST_TIMEOUT = 120_000;

describe('#inberlinwohnen testsuite()', () => {
  let browser;
  let liveListings;

  beforeAll(async () => {
    browser = await launchBrowser(providerConfig.inberlinwohnen.url);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await closeBrowser(browser);
  });

  it(
    'should test inberlinwohnen provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = {
        id: 'inberlinwohnen',
        notificationAdapter: null,
        spatialFilter: null,
        specFilter: null,
      };
      runConfig = provider.createConfig(providerConfig.inberlinwohnen, []);

      const fredy = new Fredy(runConfig, mockedJob, provider.metaInformation.id, similarityCache, browser);

      liveListings = await fredy.execute();

      if (liveListings == null || liveListings.length === 0) {
        throw new Error('Listings is empty!');
      }

      expect(liveListings).toBeInstanceOf(Array);
      const notificationObj = get();
      expect(notificationObj).toBeTypeOf('object');
      expect(notificationObj.serviceName).toBe('inberlinwohnen');
      expect(notificationObj.payload.length).toBeGreaterThan(0);
      notificationObj.payload.forEach((notify) => {
        /** check the actual structure **/
        expect(notify.id).toBeTypeOf('string');
        expect(notify.title).toBeTypeOf('string');
        expect(notify.link).toBeTypeOf('string');
        expect(notify.price).toBeTypeOf('string');
        expect(notify.size).toBeTypeOf('string');
        expect(notify.rooms).toBeTypeOf('string');
        expect(notify.address).toBeTypeOf('string');
        expect(notify.description).toBeTypeOf('string');
        /** check the values if possible **/
        expect(notify.title).not.toBe('');
        // the portal only aggregates, the link points at the partner's expose
        expect(notify.link).toMatch(/^https:\/\//);
        expect(notify.price).toContain('€');
        expect(notify.size).toContain('m²');
        // The unit follows the job owner's interface language; the mocked user settings carry
        // none, so it is the English default rather than the hard-coded "Zimmer" it used to be.
        expect(notify.rooms).toMatch(/^\d+([.,]\d+)? rooms$/);
        expect(notify.address).toContain('Berlin');
        expect(notify.description).toContain('Gesamtmiete:');
      });
      // images are optional per listing, but a result page never comes without any
      expect(notificationObj.payload.some((notify) => notify.image)).toBe(true);
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

        const enriched = await runConfig.fetchDetails(liveListings[0], browser);

        expect(enriched).toBeTruthy();
        expect(enriched.link).toBe(liveListings[0].link);
        expect(enriched.description).toBeTypeOf('string');
        // enrichment only works for partners with a known description selector,
        // for all others the original description is kept unchanged
        expect(enriched.description).toContain(liveListings[0].description);
      },
      TEST_TIMEOUT,
    );
  });
});
