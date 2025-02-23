import * as similarityCache from '#services/similarity-check/similarityCache';
import { get } from '../mocks/mockNotification';
import { providerConfig, mockFredy } from '../utils';
import { expect } from 'chai';
import * as provider from '../../lib/provider/einsAImmobilien';
import { Listing } from '#types/Listings.ts';
describe('#einsAImmobilien testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  provider.init(providerConfig.einsAImmobilien, []);
  it('should test einsAImmobilien provider', async () => {
    const Fredy = await mockFredy();
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'einsAImmobilien', similarityCache);
      fredy.execute().then((listings: Listing[]) => {
        expect(listings).to.be.a('array');
        const notificationObj = get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('einsAImmobilien');
        notificationObj.payload.forEach((notify) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('string');
          expect(notify.price).to.be.a('string');
          expect(notify.size).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.link).to.be.a('string');
          /** check the values if possible **/
          expect(notify.size).to.be.not.empty;
          expect(notify.title).to.be.not.empty;
          expect(notify.link).that.does.include('https://www.1a-immobilienmarkt.de');
        });
        resolve();
      });
    });
  });
});
