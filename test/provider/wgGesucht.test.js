/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect, vi } from 'vitest';
import * as provider from '../../lib/provider/wgGesucht.js';
import * as mockStore from '../mocks/mockStore.js';

describe('#wgGesucht testsuite()', () => {
  provider.init(providerConfig.wgGesucht, [], []);
  it('should test wgGesucht provider', async () => {
    const Fredy = await mockFredy();
    return await new Promise((resolve, reject) => {
      const fredy = new Fredy(provider.config, null, null, provider.metaInformation.id, 'wgGesucht', similarityCache);
      fredy.execute().then((listing) => {
        if (listing == null || listing.length === 0) {
          reject('Listings is empty!');
          return;
        }

        expect(listing).toBeInstanceOf(Array);
        const notificationObj = get();
        expect(notificationObj.serviceName).toBe('wgGesucht');
        notificationObj.payload.forEach((notify) => {
          expect(notify).toBeTypeOf('object');
          /** check the actual structure **/
          expect(notify.id).toBeTypeOf('string');
          expect(notify.title).toBeTypeOf('string');
          expect(notify.details).toBeTypeOf('string');
          expect(notify.price).toBeTypeOf('string');
          expect(notify.link).toBeTypeOf('string');
        });
        resolve();
      });
    });
  });

  describe('with provider_details enabled', () => {
    beforeEach(() => {
      vi.spyOn(mockStore, 'getUserSettings').mockReturnValue({ provider_details: [provider.metaInformation.id] });
      vi.spyOn(mockStore, 'getKnownListingHashesForJobAndProvider').mockReturnValue([]);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should enrich listings with details', async () => {
      const Fredy = await mockFredy();
      provider.init(providerConfig.wgGesucht, [], []);
      const fredy = new Fredy(provider.config, null, null, provider.metaInformation.id, 'wgGesucht', {
        checkAndAddEntry: () => false,
      });
      const listings = await fredy.execute();
      expect(listings).toBeInstanceOf(Array);
      listings.forEach((listing) => {
        expect(listing.link).toContain('https://www.wg-gesucht.de');
        expect(listing.description).toBeTypeOf('string');
        expect(listing.description).not.toBe('');
      });
    });
  });
});
