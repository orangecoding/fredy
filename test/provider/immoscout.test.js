/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'chai';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import { get } from '../mocks/mockNotification.js';
import * as provider from '../../lib/provider/immoscout.js';

describe('#immoscout provider testsuite()', () => {
  provider.init(providerConfig.immoscout, [], []);
  it('should test immoscout provider', async () => {
    const Fredy = await mockFredy();
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, '', similarityCache);
      fredy.execute().then((listings) => {
        expect(listings).to.be.a('array');
        const notificationObj = get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('immoscout');
        notificationObj.payload.forEach((notify) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('string');
          expect(notify.price).to.be.a('string');
          expect(notify.size).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.link).to.be.a('string');
          expect(notify.address).to.be.a('string');
          /** check the values if possible **/
          expect(notify.size).to.be.not.empty;
          expect(notify.title).to.be.not.empty;
          expect(notify.link).that.does.include('https://www.immobilienscout24.de/');
        });
        resolve();
      });
    });
  });
});
