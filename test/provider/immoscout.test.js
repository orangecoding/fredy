const similarityCache = require('../../lib/services/similarity-check/similarityCache');
const mockNotification = require('../mocks/mockNotification');
const providerConfig = require('./testProvider.json');
const mockStore = require('../mocks/mockStore');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;
const provider = require('../../lib/provider/immoscout');
const scrapingAnt = require('../../lib/services/scrapingAnt');

describe('#immoscout testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  provider.init(providerConfig.immoscout, [], []);
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

      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'test1', similarityCache);
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
