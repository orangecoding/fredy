/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import { get } from '../mocks/mockNotification.js';
import * as provider from '../../lib/provider/immoscout.js';

describe('#immoscout provider testsuite()', () => {
  provider.init(providerConfig.immoscout, [], []);
  it('should test immoscout provider', async () => {
    const Fredy = await mockFredy();
    const mockedJob = {
      id: '',
      notificationAdapter: null,
      spatialFilter: null,
      specFilter: null,
    };

    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, mockedJob, provider.metaInformation.id, similarityCache, undefined);
      fredy.execute().then((listings) => {
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
            notify.link.includes('https://www.immobilienscout24.de/') &&
            typeof notify.address === 'string'
          );
        });

        expect(hasValidNotification).toBe(true);
        resolve();
      });
    });
  });
});
