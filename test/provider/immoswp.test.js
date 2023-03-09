import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import mockNotification from '../mocks/mockNotification.js';
import { config } from '../../lib/utils.js';
import * as mockStore from '../mocks/mockStore.js';
import proxyquire$0 from 'proxyquire';
import chai from 'chai';
import * as provider from '../../lib/provider/immoswp.js';
const proxyquire = proxyquire$0.noCallThru();
const expect = chai.expect;
describe('#immoswp testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  provider.init(config.immoswp, [], []);
  const Fredy = proxyquire('../../lib/FredyRuntime', {
    './services/storage/listingsStorage': {
      ...mockStore,
    },
    './notification/notify': mockNotification,
  });
  it('should test immoswp provider', async () => {
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'immoswp', similarityCache);
      fredy.execute().then((listing) => {
        expect(listing).to.be.a('array');
        const notificationObj = mockNotification.get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('immoswp');
        notificationObj.payload.forEach((notify) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('string');
          expect(notify.price).to.be.a('string');
          expect(notify.size).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.link).to.be.a('string');
          expect(notify.address).to.be.a('string');
          /** check the values if possible **/
          expect(notify.price).that.does.include('€');
          expect(notify.title).to.be.not.empty;
          expect(notify.link).that.does.include('https://immo.swp.de');
          expect(notify.address).to.be.not.empty;
        });
        resolve();
      });
    });
  });
});
