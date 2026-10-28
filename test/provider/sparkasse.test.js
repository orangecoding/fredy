/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect, vi } from 'vitest';
import * as provider from '../../lib/provider/sparkasse.js';
import * as mockStore from '../mocks/mockStore.js';
import { launchBrowser, closeBrowser } from '../../lib/services/extractor/puppeteerExtractor.js';

/** Run-scoped provider config, built per test via createConfig(). */
let runConfig;

// One browser shared across the whole suite so both requests (search + detail)
// come from the same warm session. This prevents the second request from being
// flagged as a cold-start bot hit.
const TEST_TIMEOUT = 120_000;

describe('#sparkasse testsuite()', () => {
  let browser;
  let liveListings;

  beforeAll(async () => {
    browser = await launchBrowser(providerConfig.sparkasse.url);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await closeBrowser(browser);
  });

  it(
    'should test sparkasse provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = {
        id: 'sparkasse',
        notificationAdapter: null,
        spatialFilter: null,
        specFilter: null,
      };
      runConfig = provider.createConfig(providerConfig.sparkasse, []);

      const fredy = new Fredy(runConfig, mockedJob, provider.metaInformation.id, similarityCache, browser);

      liveListings = await fredy.execute();

      if (liveListings == null || liveListings.length === 0) {
        throw new Error('Listings is empty!');
      }

      expect(liveListings).toBeInstanceOf(Array);
      const notificationObj = get();
      expect(notificationObj).toBeTypeOf('object');
      expect(notificationObj.serviceName).toBe('sparkasse');
      notificationObj.payload.forEach((notify) => {
        /** check the actual structure **/
        expect(notify.id).toBeTypeOf('string');
        // A card marketed discreetly ("Preis auf Anfrage") leaves the price slot empty, so the
        // portal itself shows no figure; when there is one it must be a formatted "… €" string.
        if (notify.price != null) {
          expect(notify.price).toBeTypeOf('string');
          expect(notify.price).toContain('€');
        }
        // Size can legitimately be absent for a card whose layout shifts the
        // value out of the expected slot; when present it must be a formatted
        // "… m²" string.
        if (notify.size != null) {
          expect(notify.size).toBeTypeOf('string');
          expect(notify.size).toContain('m²');
        }
        expect(notify.title).toBeTypeOf('string');
        expect(notify.link).toBeTypeOf('string');
        expect(notify.address).toBeTypeOf('string');
        /** check the values if possible **/
        expect(notify.title).not.toBe('');
        expect(notify.address).not.toBe('');
        if (notify.image != null) {
          expect(notify.image).toMatch(/^https:\/\//);
        }
      });
      // the preview image lives outside of the card's link box, so it is the first
      // thing to break when the card markup is restructured
      expect(notificationObj.payload.some((notify) => notify.image)).toBe(true);
      // a whole page of price-less cards is the price selector breaking, not ten sellers
      // deciding to market discreetly at once
      expect(notificationObj.payload.some((notify) => notify.price)).toBe(true);
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

        // Call fetchDetails directly on the first live listing - no need to
        // re-scrape the search page. The shared browser keeps the session warm.
        const enriched = await runConfig.fetchDetails(liveListings[0], browser);

        expect(enriched).toBeTruthy();
        expect(enriched.link).toContain('https://immobilien.sparkasse.de');
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

    it('should read description and address from the embedded Next.js payload', async () => {
      const nextData = {
        props: {
          pageProps: {
            estate: {
              address: { street: 'Musterweg', streetNumber: '5', zip: '40545', city: 'Düsseldorf' },
              frontendItems: [
                {
                  label: 'Lage',
                  contents: [{ type: 'contentBoxes', data: [{ type: 'text', content: 'Ruhige Wohnlage am Rhein.' }] }],
                },
                { label: 'Anbieter', contents: [{ type: 'contactBox', data: [] }] },
              ],
            },
          },
        },
      };
      const extractDetails = vi
        .fn()
        .mockResolvedValue(
          `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`,
        );
      const listing = {
        id: 'listing-1',
        link: 'https://immobilien.sparkasse.de/expose/FID-1.html',
        address: 'Düsseldorf / Oberkassel',
      };

      const enriched = await runConfig.fetchDetails(listing, browser, extractDetails);

      expect(enriched.address).toBe('Musterweg 5, 40545 Düsseldorf');
      expect(enriched.description).toBe('Lage\nRuhige Wohnlage am Rhein.');
      expect(extractDetails).toHaveBeenCalledWith(listing.link, 'body', expect.objectContaining({ browser }));
    });

    it('should keep the listing when the detail page carries no estate payload', async () => {
      const listing = { id: 'listing-1', link: 'https://immobilien.sparkasse.de/expose/FID-1.html', address: 'Bonn' };

      const withoutPayload = vi.fn().mockResolvedValue('<html><body></body></html>');
      expect(await runConfig.fetchDetails(listing, browser, withoutPayload)).toBe(listing);

      const withoutPage = vi.fn().mockResolvedValue(null);
      expect(await runConfig.fetchDetails(listing, browser, withoutPage)).toBe(listing);
    });
  });
});
