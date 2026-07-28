/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect } from 'vitest';
import * as provider from '../../lib/provider/ohneMakler.js';

/** Run-scoped provider config, built per test via createConfig(). */
let runConfig;

describe('#ohneMakler testsuite()', () => {
  it('should test ohneMakler provider', async () => {
    const Fredy = await mockFredy();
    const mockedJob = {
      id: 'ohneMakler',
      notificationAdapter: null,
      spatialFilter: null,
      specFilter: null,
    };
    runConfig = provider.createConfig(providerConfig.ohneMakler, []);

    const fredy = new Fredy(runConfig, mockedJob, provider.metaInformation.id, similarityCache, undefined);

    const listing = await fredy.execute();

    if (listing == null || listing.length === 0) {
      throw new Error('Listings is empty!');
    }

    expect(listing).toBeInstanceOf(Array);
    const notificationObj = get();
    expect(notificationObj).toBeTypeOf('object');
    expect(notificationObj.serviceName).toBe('ohneMakler');
    notificationObj.payload.forEach((notify) => {
      /** check the actual structure **/
      expect(notify.id).toBeTypeOf('string');
      expect(notify.price).toBeTypeOf('string');
      expect(notify.price).toContain('€');
      expect(notify.size).toBeTypeOf('string');
      expect(notify.size).toContain('m²');
      expect(notify.title).toBeTypeOf('string');
      expect(notify.link).toBeTypeOf('string');
      expect(notify.address).toBeTypeOf('string');
      /** check the values if possible **/
      expect(notify.size).toBeTypeOf('string');
      expect(notify.title).not.toBe('');
      expect(notify.address).not.toBe('');
    });
  });
});
