/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import { get } from '../mocks/mockNotification.js';
import * as provider from '../../lib/provider/immoscoutAt.js';

/** Run-scoped provider config, built per test via createConfig(). */
let runConfig;

// Same shape as the German suite: the mobile REST API is fetch-based, so both tests share one set
// of module-level listings and the API is queried once.
const TEST_TIMEOUT = 120_000;

describe('#immoscoutAt provider testsuite()', () => {
  runConfig = provider.createConfig(providerConfig.immoscoutAt, [], []);

  let liveListings;

  it(
    'should test immoscoutAt provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = {
        id: '',
        notificationAdapter: null,
        spatialFilter: null,
        specFilter: null,
      };

      return await new Promise((resolve, reject) => {
        const fredy = new Fredy(runConfig, mockedJob, provider.metaInformation.id, similarityCache, undefined);
        fredy.execute().then((listings) => {
          if (listings == null || listings.length === 0) {
            reject('Listings is empty!');
            return;
          }

          liveListings = listings;
          expect(listings).toBeInstanceOf(Array);
          const notificationObj = get();
          expect(notificationObj).toBeTypeOf('object');

          // check if there is at least one valid notification
          const hasValidNotification = notificationObj.payload.some((notify) => {
            return (
              typeof notify.id === 'string' &&
              typeof notify.price === 'string' &&
              notify.price.includes('€') &&
              typeof notify.size === 'string' &&
              notify.size.includes('m²') &&
              typeof notify.title === 'string' &&
              notify.title !== '' &&
              typeof notify.link === 'string' &&
              typeof notify.address === 'string'
            );
          });

          expect(hasValidNotification).toBe(true);
          // Something only an Austrian answer has: the search is Vienna, a German fixture served by
          // a broken routing would still pass every shape check above. And the feed's
          // "(unvollständige Adresse)" marker stays out of what is notified.
          expect(notificationObj.payload.some((notify) => /Wien/.test(notify.address))).toBe(true);
          expect(notificationObj.payload.some((notify) => /unvollständige Adresse/.test(notify.address))).toBe(false);
          resolve();
        });
      });
    },
    TEST_TIMEOUT,
  );

  // The one thing about this provider that is not obvious from its metaInformation. An Austrian
  // advert is served by the German index under a German numeric id, and the exposé the API returns
  // states the German page as that advert's own share link - a link built from `baseUrl` would
  // point at the Austrian site, whose ids are 24 hex characters, and 404.
  it('should link Austrian listings to the page that actually serves them', () => {
    if (!liveListings?.length) throw new Error('No listings from the first test');

    expect(provider.metaInformation.baseUrl).toBe('https://www.immobilienscout24.at/');
    for (const listing of liveListings) {
      expect(listing.link).toMatch(/^https:\/\/www\.immobilienscout24\.de\/expose\/\d+$/);
    }
  });

  describe('with provider_details enabled', () => {
    it(
      'should enrich listings with details',
      async () => {
        if (!liveListings?.length) throw new Error('No listings from first test to enrich');

        const enriched = await runConfig.fetchDetails(liveListings[0]);

        expect(enriched).toBeTruthy();
        expect(enriched.description).toBeTypeOf('string');
        expect(enriched.description).not.toBe('');
      },
      TEST_TIMEOUT,
    );
  });
});
