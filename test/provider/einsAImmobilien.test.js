const similarityCache = require('../../lib/services/similarity-check/similarityCache');
const mockNotification = require('../mocks/mockNotification');
const providerConfig = require('./testProvider.json');
const mockStore = require('../mocks/mockStore');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;
const provider = require('../../lib/provider/einsAImmobilien');

describe('#einsAImmobilien testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });

  provider.init(providerConfig.einsAImmobilien, [], []);

  const Fredy = proxyquire('../../lib/FredyRuntime', {
    './services/storage/listingsStorage': {
      ...mockStore,
    },
    './notification/notify': mockNotification,
  });

  it('should test einsAImmobilien provider', async () => {
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'test1', similarityCache);
      fredy.execute().then((listings) => {
        expect(listings).to.be.a('array');

        const notificationObj = mockNotification.get();
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
          expect(notify.price).that.does.include('EUR');
          expect(notify.size).to.be.not.empty;
          expect(notify.title).to.be.not.empty;
          expect(notify.link).that.does.include('https://www.1a-immobilienmarkt.de');
        });
        resolve();
      });
    });
  });
});
