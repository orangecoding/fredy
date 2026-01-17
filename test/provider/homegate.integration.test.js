/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Homegate.ch provider integration test
 *
 * Requires Bright Data credentials to run:
 * - BRIGHT_DATA_TOKEN: API token from Bright Data
 * - BRIGHT_DATA_ZONE: Zone name (e.g., "immoscout")
 *
 * Run with: BRIGHT_DATA_TOKEN=... BRIGHT_DATA_ZONE=... npm test
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect } from 'chai';
import * as provider from '../../lib/provider/homegate.js';

const BRIGHT_DATA_TOKEN = process.env.BRIGHT_DATA_TOKEN;
const BRIGHT_DATA_ZONE = process.env.BRIGHT_DATA_ZONE;

describe('#homegate integration testsuite()', function () {
  // Bright Data requests can take a while
  this.timeout(180000);

  before(function () {
    if (!BRIGHT_DATA_TOKEN || !BRIGHT_DATA_ZONE) {
      this.skip();
    }
  });

  it('should fetch listings via Bright Data', async function () {
    const Fredy = await mockFredy();
    provider.init(providerConfig.homegate, [], []);

    const globalSettings = {
      brightDataApiToken: BRIGHT_DATA_TOKEN,
      brightDataZone: BRIGHT_DATA_ZONE,
    };

    const fredy = new Fredy(
      provider.config,
      null,
      provider.metaInformation.id,
      'homegate',
      similarityCache,
      globalSettings,
    );
    const listing = await fredy.execute();

    expect(listing).to.be.a('array');
    expect(listing.length).to.be.greaterThan(0);

    const notificationObj = get();
    expect(notificationObj).to.be.a('object');
    expect(notificationObj.serviceName).to.equal('homegate');

    notificationObj.payload.forEach((notify) => {
      // Check the actual structure
      expect(notify.id).to.be.a('string');
      expect(notify.price).to.be.a('string');
      expect(notify.title).to.be.a('string');
      expect(notify.link).to.be.a('string');

      // Check the values
      expect(notify.title).to.be.not.empty;
      expect(notify.link).that.does.include('https://www.homegate.ch');

      // Price may be empty for some listings
      if (notify.price) {
        expect(notify.price).to.match(/CHF/);
      }
    });
  });
});
