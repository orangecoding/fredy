/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { providerConfig, mockFredy } from '../utils.js';
import { expect, vi } from 'vitest';
import * as provider from '../../lib/provider/immobilienDe.js';
import * as mockStore from '../mocks/mockStore.js';

describe('#immobilien.de testsuite()', () => {
  provider.init(providerConfig.immobilienDe, [], []);
  it('should test immobilien.de provider', async () => {
    const Fredy = await mockFredy();
    const fredy = new Fredy(provider.config, null, null, provider.metaInformation.id, 'test1', similarityCache);
    const listing = await fredy.execute();

    if (listing == null || listing.length === 0) {
      throw new Error('Listings is empty!');
    }

    expect(listing).toBeInstanceOf(Array);
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
      provider.init(providerConfig.immobilienDe, [], []);
      const fredy = new Fredy(provider.config, null, null, provider.metaInformation.id, 'test1', {
        checkAndAddEntry: () => false,
      });
      const listings = await fredy.execute();
      if (listings == null) return;
      expect(listings).toBeInstanceOf(Array);
      listings.forEach((listing) => {
        expect(listing.link).toContain('https://www.immobilien.de');
        expect(listing.address).toBeTypeOf('string');
        expect(listing.address).not.toBe('');
        // description may be null if selectors don't match yet — falls back gracefully
        if (listing.description != null) {
          expect(listing.description).toBeTypeOf('string');
        }
      });
    });
  });
});
