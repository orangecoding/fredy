/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import { get } from '../mocks/mockNotification.js';
import * as provider from '../../lib/provider/deutscheWohnen.js';

/** Run-scoped provider config, built per test via createConfig(). */
let runConfig;

// Deutsche Wohnen uses a JSON API (fetch-based, no browser). Both tests share
// the same module-level listings so the API is only queried once.
const TEST_TIMEOUT = 120_000;

describe('#deutscheWohnen provider testsuite()', () => {
  runConfig = provider.createConfig(providerConfig.deutscheWohnen, [], []);

  let liveListings;

  it(
    'should test deutscheWohnen provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = {
        id: 'deutscheWohnen',
        notificationAdapter: null,
        spatialFilter: null,
        specFilter: null,
      };

      const fredy = new Fredy(runConfig, mockedJob, provider.metaInformation.id, similarityCache, undefined);

      liveListings = await fredy.execute();

      if (liveListings == null || liveListings.length === 0) {
        throw new Error('Listings is empty!');
      }

      expect(liveListings).toBeInstanceOf(Array);
      const notificationObj = get();
      expect(notificationObj).toBeTypeOf('object');
      expect(notificationObj.serviceName).toBe('deutscheWohnen');

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
          notify.link.includes('https://www.deutsche-wohnen.com/') &&
          typeof notify.address === 'string' &&
          notify.address !== ''
        );
      });

      expect(hasValidNotification).toBe(true);
    },
    TEST_TIMEOUT,
  );

  describe('with provider_details enabled', () => {
    it(
      'should enrich listings with details',
      async () => {
        if (!liveListings?.length) throw new Error('No listings from first test to enrich');

        const enriched = await runConfig.fetchDetails(liveListings[0]);

        expect(enriched).toBeTruthy();
        expect(enriched.link).toContain('https://www.deutsche-wohnen.com/');
        expect(enriched.address).toBeTypeOf('string');
        expect(enriched.address).not.toBe('');
        if (enriched.description != null) {
          expect(enriched.description).toBeTypeOf('string');
          expect(enriched.description).not.toBe('');
        }
      },
      TEST_TIMEOUT,
    );
  });
});
