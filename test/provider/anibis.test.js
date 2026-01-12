/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Anibis.ch provider test
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect } from 'chai';
import * as provider from '../../lib/provider/anibis.js';

describe('#anibis testsuite()', () => {
  it('should test anibis provider', async () => {
    const Fredy = await mockFredy();
    provider.init(providerConfig.anibis, [], []);

    const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'anibis', similarityCache);
    const listing = await fredy.execute();

    expect(listing).to.be.a('array');
    const notificationObj = get();
    expect(notificationObj).to.be.a('object');
    expect(notificationObj.serviceName).to.equal('anibis');
    notificationObj.payload.forEach((notify) => {
      /** check the actual structure **/
      expect(notify.id).to.be.a('string');
      expect(notify.price).to.be.a('string');
      expect(notify.title).to.be.a('string');
      expect(notify.link).to.be.a('string');
      /** check the values if possible **/
      expect(notify.title).to.be.not.empty;
      expect(notify.link).that.does.include('https://www.anibis.ch');
      // Price may be empty for some listings
      if (notify.price) {
        expect(notify.price).to.match(/\d/);
      }
    });
  });
});
