import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import { expect } from 'chai';
import * as provider from '../../lib/provider/immonet.js';

describe('#immonet testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  provider.init(providerConfig.immonet, [], []);
  it('should test immonet provider', async () => {
    const Fredy = await mockFredy();
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'immonet', similarityCache);
      fredy.execute().then((listing) => {
        expect(listing).to.be.a('array');
        const notificationObj = get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('immonet');
        notificationObj.payload.forEach((notify) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('string');
          expect(notify.price).to.be.a('string');
          expect(notify.size).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.link).to.be.a('string');
          expect(notify.address).to.be.a('string');

          expect(notify.size).that.does.include('m²');
          expect(notify.title).to.be.not.empty;
          expect(notify.address).to.be.not.empty;
        });
        resolve();
      });
    });
  });
});
