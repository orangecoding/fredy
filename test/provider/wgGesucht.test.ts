import * as similarityCache from '#services/similarity-check/similarityCache';
import { get } from '../mocks/mockNotification';
import { mockFredy, providerConfig } from '../utils';
import { expect } from 'chai';
import * as provider from '../../lib/provider/wgGesucht';
import { Listing } from '#types/Listings.ts';
describe('#wgGesucht testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  provider.init(providerConfig.wgGesucht, []);
  it('should test wgGesucht provider', async () => {
    const Fredy = await mockFredy();
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'wgGesucht', similarityCache);
      fredy.execute().then((listing: Listing[]) => {
        expect(listing).to.be.a('array');
        const notificationObj = get();
        expect(notificationObj.serviceName).to.equal('wgGesucht');
        notificationObj.payload.forEach((notify) => {
          expect(notify).to.be.a('object');
          /** check the actual structure **/
          expect(notify.id).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.details).to.be.a('string');
          expect(notify.price).to.be.a('string');
          expect(notify.link).to.be.a('string');
        });
        resolve();
      });
    });
  });
});
