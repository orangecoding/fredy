/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect } from 'vitest';
import * as provider from '../../lib/provider/neubauKompass.js';

describe('#neubauKompass testsuite()', () => {
  provider.init(providerConfig.neubauKompass, [], []);
  it('should test neubauKompass provider', async () => {
    const Fredy = await mockFredy();
    const mockedJob = {
      id: 'neubauKompass',
      notificationAdapter: null,
      spatialFilter: null,
      specFilter: null,
    };

    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, mockedJob, provider.metaInformation.id, similarityCache);

      fredy.execute().then((listing) => {
        expect(listing).toBeInstanceOf(Array);
        const notificationObj = get();
        expect(notificationObj.serviceName).toBe('neubauKompass');
        notificationObj.payload.forEach((notify) => {
          expect(notify).toBeTypeOf('object');
          /** check the actual structure **/
          expect(notify.id).toBeTypeOf('string');
          expect(notify.title).toBeTypeOf('string');
          expect(notify.link).toBeTypeOf('string');
          expect(notify.address).toBeTypeOf('string');
          /** check the values if possible **/
          expect(notify.title).not.toBe('');
          expect(notify.link).toContain('https://www.neubaukompass.de');
          expect(notify.address).not.toBe('');
        });
        resolve();
      });
    });
  });
});
