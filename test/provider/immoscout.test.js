import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import chai from 'chai';
import * as provider from '../../lib/provider/immoscout.js';
import * as scrapingAnt from '../../lib/services/scrapingAnt.js';
const expect = chai.expect;
describe('#immoscout testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  provider.init(providerConfig.immoscout, [], []);
  it('should test immoscout provider', async () => {
    const Fredy = await mockFredy();
    return await new Promise((resolve) => {
      if (!scrapingAnt.isScrapingAntApiKeySet()) {
        /* eslint-disable no-console */
        console.info('Skipping Immoscout test as ScrapingAnt Api Key is not set.');
        /* eslint-enable no-console */
        resolve();
        return;
      }
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'immoscout', similarityCache);
      fredy.execute().then((listing) => {
        expect(listing).to.be.a('array');
        const notificationObj = get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('immoscout');
        notificationObj.payload.forEach((notify) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('number');
          expect(notify.price).to.be.a('string');
          expect(notify.size).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.link).to.be.a('string');
          expect(notify.address).to.be.a('string');
          /** check the values if possible **/
          expect(notify.price).that.does.include('€');
          expect(notify.size).that.does.include('m²');
          expect(notify.title).to.be.not.empty;
          expect(notify.link).that.does.include('https://www.immobilienscout24.de');
          expect(notify.address).to.be.not.empty;
        });
        resolve();
      });
    });
  });
});
