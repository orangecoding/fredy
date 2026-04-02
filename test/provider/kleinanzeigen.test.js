/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect, vi } from 'vitest';
import * as provider from '../../lib/provider/kleinanzeigen.js';
import * as mockStore from '../mocks/mockStore.js';

describe('#kleinanzeigen testsuite()', () => {
  it('should test kleinanzeigen provider', async () => {
    const Fredy = await mockFredy();
    provider.init(providerConfig.kleinanzeigen, [], []);
    return await new Promise((resolve, reject) => {
      const fredy = new Fredy(
        provider.config,
        null,
        null,
        provider.metaInformation.id,
        'kleinanzeigen',
        similarityCache,
      );
      fredy.execute().then((listing) => {
        if (listing == null || listing.length === 0) {
          reject('Listings is empty!');
          return;
        }

        expect(listing).toBeInstanceOf(Array);
        const notificationObj = get();
        expect(notificationObj).toBeTypeOf('object');
        expect(notificationObj.serviceName).toBe('kleinanzeigen');
        notificationObj.payload.forEach((notify) => {
          /** check the actual structure **/
          expect(notify.id).toBeTypeOf('string');
          expect(notify.title).toBeTypeOf('string');
          expect(notify.link).toBeTypeOf('string');
          expect(notify.address).toBeTypeOf('string');
          /** check the values if possible **/
          expect(notify.title).not.toBe('');
          expect(notify.link).toContain('https://www.kleinanzeigen.de');
          expect(notify.address).not.toBe('');
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
      provider.init(providerConfig.kleinanzeigen, [], []);
      const fredy = new Fredy(provider.config, null, null, provider.metaInformation.id, 'kleinanzeigen', {
        checkAndAddEntry: () => false,
      });
      const listings = await fredy.execute();
      expect(listings).toBeInstanceOf(Array);
      listings.forEach((listing) => {
        expect(listing.link).toContain('https://www.kleinanzeigen.de');
        expect(listing.address).toBeTypeOf('string');
        expect(listing.address).not.toBe('');
        expect(listing.description).toBeTypeOf('string');
        expect(listing.description).not.toBe('');
      });
    });
  });
});
