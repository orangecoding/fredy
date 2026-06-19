/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect } from 'vitest';
import * as provider from '../../lib/provider/immoscout24ch.js';

describe('#immoscout24ch testsuite()', () => {
  it('should test immoscout24ch provider', async () => {
    const Fredy = await mockFredy();
    const mockedJob = {
      id: 'immoscout24ch',
      notificationAdapter: null,
      spatialFilter: null,
      specFilter: null,
    };
    provider.init(providerConfig.immoscout24ch, []);

    const fredy = new Fredy(provider.config, mockedJob, provider.metaInformation.id, similarityCache, undefined);

    const listing = await fredy.execute();

    if (listing == null || listing.length === 0) {
      throw new Error('Listings is empty!');
    }

    expect(listing).toBeInstanceOf(Array);
    const notificationObj = get();
    expect(notificationObj).toBeTypeOf('object');
    expect(notificationObj.serviceName).toBe('immoscout24ch');
    notificationObj.payload.forEach((notify) => {
      expect(notify.id).toBeTypeOf('string');
      expect(notify.title).toBeTypeOf('string');
      expect(notify.link).toBeTypeOf('string');
      expect(notify.link).toContain('https://www.immoscout24.ch');
      expect(notify.address).toBeTypeOf('string');
      expect(notify.address).not.toBe('');
      if (notify.price != null) {
        expect(notify.price).toBeTypeOf('string');
        expect(notify.price).toContain('CHF');
      }
      if (notify.size != null) {
        expect(notify.size).toBeTypeOf('string');
        expect(notify.size).toContain('m²');
      }
      if (notify.image != null) {
        expect(notify.image).toBeTypeOf('string');
        expect(notify.image).toContain('immoscout24.ch');
      }
    });
  });
});
