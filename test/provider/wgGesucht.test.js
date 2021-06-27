const similarityCache = require('../../lib/services/similarity-check/similarityCache');
const mockNotification = require('../mocks/mockNotification');
const providerConfig = require('./testProvider.json');
const mockStore = require('../mocks/mockStore');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;
const provider = require('../../lib/provider/wgGesucht');

describe('#wgGesucht testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  provider.init(providerConfig.wgGesucht, [], []);
  const Fredy = proxyquire('../../lib/FredyRuntime', {
    './services/storage/listingsStorage': {
      ...mockStore,
    },
    './notification/notify': mockNotification,
  });

  it('should test wgGesucht provider', async () => {
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'test1', similarityCache);
      fredy.execute().then((listing) => {
        expect(listing).to.be.a('array');
        const notificationObj = mockNotification.get();
        expect(notificationObj.serviceName).to.equal('wgGesucht');
        notificationObj.payload.forEach((notify) => {
          expect(notify).to.be.a('object');

          /** check the actual structure **/

          expect(notify.id).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.details).to.be.a('string');
          expect(notify.size).to.be.a('string');
          expect(notify.price).to.be.a('string');
          expect(notify.link).to.be.a('string');
        });
        resolve();
      });
    });
  });
});
