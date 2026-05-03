/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { providerConfig, mockFredy } from '../utils.js';
import { expect } from 'vitest';
import * as provider from '../../lib/provider/einsAImmobilien.js';

describe('#einsAImmobilien testsuite()', () => {
  provider.init(providerConfig.einsAImmobilien, []);
  it('should test einsAImmobilien provider', async () => {
    const Fredy = await mockFredy();
    const mockedJob = {
      id: 'einsAImmobilien',
      notificationAdapter: null,
      spatialFilter: null,
      specFilter: null,
    };
    return await new Promise((resolve, reject) => {
      const fredy = new Fredy(provider.config, mockedJob, provider.metaInformation.id, similarityCache, undefined);
      fredy.execute().then((listings) => {
        if (listings == null || listings.length === 0) {
          reject('Listings is empty!');
          return;
        }
        expect(listings).toBeInstanceOf(Array);
        const notificationObj = get();
        expect(notificationObj).toBeTypeOf('object');
        expect(notificationObj.serviceName).toBe('einsAImmobilien');
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
          expect(notify.link).toContain('https://www.1a-immobilienmarkt.de');
        });
        resolve();
      });
    });
  });
});
