import * as similarityCache from '#services/similarity-check/similarityCache';
import { get } from '../mocks/mockNotification';
import { mockFredy, providerConfig } from '../utils';
import { expect } from 'chai';
import * as provider from '../../lib/provider/immoswp';
import { Listing } from '#types/Listings.ts';
describe('#immoswp testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  provider.init(providerConfig.immoswp, []);
  it('should test immoswp provider', async () => {
    const Fredy = await mockFredy();
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'immoswp', similarityCache);
      fredy.execute().then((listing: Listing[]) => {
        expect(listing).to.be.a('array');
        const notificationObj = get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('immoswp');
        notificationObj.payload.forEach((notify) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('string');
          expect(notify.price).to.be.a('string');
          expect(notify.size).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.link).to.be.a('string');
          /** check the values if possible **/
          expect(notify.price).that.does.include('€');
          expect(notify.title).to.be.not.empty;
          expect(notify.link).that.does.include('https://immo.swp.de');
        });
        resolve();
      });
    });
  });
});
