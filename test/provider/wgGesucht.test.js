import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import mockNotification from '../mocks/mockNotification.js';
import { config } from '../../lib/utils.js';
import * as mockStore from '../mocks/mockStore.js';
import proxyquire$0 from 'proxyquire';
import chai from 'chai';
import * as provider from '../../lib/provider/wgGesucht.js';
const proxyquire = proxyquire$0.noCallThru();
const expect = chai.expect;
describe('#wgGesucht testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  provider.init(config.wgGesucht, [], []);
  const Fredy = proxyquire('../../lib/FredyRuntime', {
    './services/storage/listingsStorage': {
      ...mockStore,
    },
    './notification/notify': mockNotification,
  });
  it('should test wgGesucht provider', async () => {
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'wgGesucht', similarityCache);
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
