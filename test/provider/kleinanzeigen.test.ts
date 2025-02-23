import * as similarityCache from '#services/similarity-check/similarityCache';
import { get } from '../mocks/mockNotification';
import { mockFredy, providerConfig } from '../utils';
import { expect } from 'chai';
import * as provider from '../../lib/provider/kleinanzeigen';
import { Listing } from '#types/Listings.ts';
describe('#kleinanzeigen testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  it('should test kleinanzeigen provider', async () => {
    const Fredy = await mockFredy();
    provider.init(providerConfig.kleinanzeigen, [], []);
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'kleinanzeigen', similarityCache);
      fredy.execute().then((listing: Listing[]) => {
        expect(listing).to.be.a('array');
        const notificationObj = get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('kleinanzeigen');
        notificationObj.payload.forEach((notify) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.link).to.be.a('string');
          expect(notify.address).to.be.a('string');
          /** check the values if possible **/
          expect(notify.title).to.be.not.empty;
          expect(notify.link).that.does.include('https://www.kleinanzeigen.de');
          expect(notify.address).to.be.not.empty;
        });
        resolve();
      });
    });
  });
});
