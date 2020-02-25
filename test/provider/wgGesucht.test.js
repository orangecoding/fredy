const mockNotification = require('../mocks/mockNotification');
const mockConfig = require('../../conf/forTesting/config.multi.test');
const mockStore = require('../mocks/mockStore');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;
const provider = require('../../lib/provider/wgGesucht');

describe('#wgGesucht testsuite()', () => {
  provider.init(mockConfig.jobs.test1.provider.wgGesucht, [], []);
  const Fredy = proxyquire('../../lib/FredyRuntime', {
    './services/store': mockStore,
    './notification/notify': mockNotification
  });

  it('should test wgGesucht provider', async () => {
    return await new Promise(resolve => {
      const fredy = new Fredy(provider.config, null, provider.id(), 'test1');
      fredy.execute().then(() => {
        const wgGesuchtDbContent = fredy._getStore()._db;
        expect(wgGesuchtDbContent.wgGesucht).to.be.a('array');
        const notificationObj = mockNotification.get();
        expect(notificationObj.serviceName).to.equal('wgGesucht');
        notificationObj.payload.forEach(notify => {
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
