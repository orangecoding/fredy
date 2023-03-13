import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { providerConfig, mockFredy } from '../utils.js';
import chai from 'chai';
import * as provider from '../../lib/provider/einsAImmobilien.js';

const expect = chai.expect;

describe('#einsAImmobilien testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  provider.init(providerConfig.einsAImmobilien, [], []);
  it('should test einsAImmobilien provider', async () => {
    const Fredy = await mockFredy();
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'einsAImmobilien', similarityCache);
      fredy.execute().then((listings) => {
        expect(listings).to.be.a('array');
        const notificationObj = get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('einsAImmobilien');
        notificationObj.payload.forEach((notify) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('number');
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
