/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect, vi } from 'vitest';
import * as provider from '../../lib/provider/immowelt.js';
import * as mockStore from '../mocks/mockStore.js';

describe('#immowelt testsuite()', () => {
  it('should test immowelt provider', async () => {
    const Fredy = await mockFredy();
    const mockedJob = {
      id: 'immowelt',
      notificationAdapter: null,
      spatialFilter: null,
      specFilter: null,
    };
    provider.init(providerConfig.immowelt, [], []);

    const fredy = new Fredy(provider.config, mockedJob, provider.metaInformation.id, similarityCache, undefined);

    const listing = await fredy.execute();

    if (listing == null || listing.length === 0) {
      throw new Error('Listings is empty!');
    }

    expect(listing).toBeInstanceOf(Array);
    const notificationObj = get();
    expect(notificationObj).toBeTypeOf('object');
    expect(notificationObj.serviceName).toBe('immowelt');
    notificationObj.payload.forEach((notify) => {
      /** check the actual structure **/
      expect(notify.id).toBeTypeOf('string');
      if (notify.price != null) {
        expect(notify.price).toBeTypeOf('string');
        expect(notify.price).toContain('€');
      }
      expect(notify.title).toBeTypeOf('string');
      expect(notify.link).toBeTypeOf('string');
      expect(notify.address).toBeTypeOf('string');
      /** check the values if possible **/
      if (notify.size != null && notify.size.trim().toLowerCase() !== 'k.a.') {
        expect(notify.size).toBeTypeOf('string');
        expect(notify.size).toContain('m²');
      }
      expect(notify.title).not.toBe('');
      expect(notify.link).toContain('https://www.immowelt.de');
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
      provider.init(providerConfig.immowelt, [], []);
      const mockedJob = { id: 'immowelt', notificationAdapter: null, specFilter: null, spatialFilter: null };

      const fredy = new Fredy(
        provider.config,
        mockedJob,
        provider.metaInformation.id,
        { checkAndAddEntry: () => false },
        undefined,
      );
      const listings = await fredy.execute();
      expect(listings).toBeInstanceOf(Array);
      listings.forEach((listing) => {
        expect(listing.link).toContain('https://www.immowelt.de');
        expect(listing.address).toBeTypeOf('string');
        expect(listing.address).not.toBe('');
        // description is enriched from the detail page; falls back gracefully if blocked
        if (listing.description != null) {
          expect(listing.description).toBeTypeOf('string');
        }
      });
    });
  });
});
