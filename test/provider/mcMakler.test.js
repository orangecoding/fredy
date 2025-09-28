import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect } from 'chai';
import * as provider from '../../lib/provider/mcMakler.js';

describe('#mcMakler testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });

  it('should test mcMakler provider', async () => {
    const Fredy = await mockFredy();
    provider.init(providerConfig.mcMakler, []);

    const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'mcMakler', similarityCache);
    const listing = await fredy.execute();

    expect(listing).to.be.a('array');
    const notificationObj = get();
    expect(notificationObj).to.be.a('object');
    expect(notificationObj.serviceName).to.equal('mcMakler');
    notificationObj.payload.forEach((notify) => {
      /** check the actual structure **/
      expect(notify.id).to.be.a('string');
      expect(notify.price).to.be.a('string');
      expect(notify.size).to.be.a('string');
      expect(notify.title).to.be.a('string');
      expect(notify.link).to.be.a('string');
      expect(notify.address).to.be.a('string');
      /** check the values if possible **/
      expect(notify.size).that.does.include('m²');
      expect(notify.title).to.be.not.empty;
      expect(notify.address).to.be.not.empty;
    });
  });
});
