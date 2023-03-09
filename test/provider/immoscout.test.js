import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import mockNotification from '../mocks/mockNotification.js';
import { config } from '../../lib/utils.js';
import * as mockStore from '../mocks/mockStore.js';
import proxyquire$0 from 'proxyquire';
import chai from 'chai';
import * as provider from '../../lib/provider/immoscout.js';
import * as scrapingAnt from '../../lib/services/scrapingAnt.js';
const proxyquire = proxyquire$0.noCallThru();
const expect = chai.expect;
describe('#immoscout testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  provider.init(config.immoscout, [], []);
  const Fredy = proxyquire('../../lib/FredyRuntime', {
    './services/storage/listingsStorage': {
      ...mockStore,
    },
    './notification/notify': mockNotification,
  });
  it('should test immoscout provider', async () => {
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
        const notificationObj = mockNotification.get();
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
