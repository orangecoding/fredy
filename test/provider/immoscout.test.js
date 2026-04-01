/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect, vi } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import { get } from '../mocks/mockNotification.js';
import * as provider from '../../lib/provider/immoscout.js';
import * as mockStore from '../mocks/mockStore.js';

describe('#immoscout provider testsuite()', () => {
  provider.init(providerConfig.immoscout, [], []);
  it('should test immoscout provider', async () => {
    const Fredy = await mockFredy();
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, null, provider.metaInformation.id, '', similarityCache);
      fredy.execute().then((listings) => {
        expect(listings).toBeInstanceOf(Array);
        const notificationObj = get();
        expect(notificationObj).toBeTypeOf('object');
        expect(notificationObj.serviceName).toBe('immoscout');
        notificationObj.payload.forEach((notify) => {
          /** check the actual structure **/
          expect(notify.id).toBeTypeOf('string');
          expect(notify.price).toBeTypeOf('string');
          expect(notify.size).toBeTypeOf('string');
          expect(notify.title).toBeTypeOf('string');
          expect(notify.link).toBeTypeOf('string');
          expect(notify.address).toBeTypeOf('string');
          /** check the values if possible **/
          expect(notify.size).not.toBe('');
          expect(notify.title).not.toBe('');
          expect(notify.link).toContain('https://www.immobilienscout24.de/');
        });
        resolve();
      });
    });
  });

  describe('with provider_details enabled', () => {
    beforeEach(() => {
      vi.spyOn(mockStore, 'getUserSettings').mockReturnValue({ provider_details: true });
      vi.spyOn(mockStore, 'getKnownListingHashesForJobAndProvider').mockReturnValue([]);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should enrich listings with details', async () => {
      const Fredy = await mockFredy();
      provider.init(providerConfig.immoscout, [], []);
      const fredy = new Fredy(provider.config, null, null, provider.metaInformation.id, '', {
        checkAndAddEntry: () => false,
      });
      const listings = await fredy.execute();
      expect(listings).toBeInstanceOf(Array);
      listings.forEach((listing) => {
        expect(listing.description).toBeTypeOf('string');
        expect(listing.description).not.toBe('');
      });
    });
  });
});
