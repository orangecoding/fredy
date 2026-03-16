/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect } from 'vitest';
import * as provider from '../../lib/provider/wgGesucht.js';

describe('#wgGesucht testsuite()', () => {
  provider.init(providerConfig.wgGesucht, [], []);
  it('should test wgGesucht provider', async () => {
    const Fredy = await mockFredy();
    const mockedJob = {
      id: 'wgGesucht',
      notificationAdapter: null,
      spatialFilter: null,
      specFilter: null,
    };

    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, mockedJob, provider.metaInformation.id, similarityCache);

      fredy.execute().then((listing) => {
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
});
