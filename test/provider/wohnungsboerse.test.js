/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { providerConfig, mockFredy } from '../utils.js';
import { expect } from 'vitest';
import * as provider from '../../lib/provider/wohnungsboerse.js';

describe('#wohnungsboerse testsuite()', () => {
  provider.init(providerConfig.wohnungsboerse, [], []);
  it('should test wohnungsboerse provider', async () => {
    const Fredy = await mockFredy();
    return await new Promise((resolve) => {
      const fredy = new Fredy(
        provider.config,
        null,
        null,
        provider.metaInformation.id,
        'wohnungsboerse',
        similarityCache,
      );
      fredy.execute().then((listings) => {
        expect(listings).toBeInstanceOf(Array);
        const notificationObj = get();
        expect(notificationObj).toBeTypeOf('object');
        expect(notificationObj.serviceName).toBe('wohnungsboerse');
        notificationObj.payload.forEach((notify) => {
          /** check the actual structure **/
          expect(notify.id).toBeTypeOf('string');
          expect(notify.price).toBeTypeOf('string');
          expect(notify.size).toBeTypeOf('string');
          expect(notify.title).toBeTypeOf('string');
          expect(notify.link).toBeTypeOf('string');
          expect(notify.address).toBeTypeOf('string');
          /** check the values if possible **/
          expect(notify.size).not.toBe('');
          expect(notify.title).not.toBe('');
          expect(notify.link).toContain('https://www.wohnungsboerse.net');
        });
        resolve();
      });
    });
  });
});
