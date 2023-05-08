import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import chai from 'chai';
import * as provider from '../../lib/provider/kleinanzeigen.js';
const expect = chai.expect;
describe('#kleinanzeigen testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  it('should test kleinanzeigen provider', async () => {
    const Fredy = await mockFredy();
    provider.init(providerConfig.kleinanzeigen, [], []);
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'kleinanzeigen', similarityCache);
      fredy.execute().then((listing) => {
        expect(listing).to.be.a('array');
        const notificationObj = get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('kleinanzeigen');
        notificationObj.payload.forEach((notify) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('number');
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
