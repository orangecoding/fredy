const mockNotification = require('../mocks/mockNotification');
const mockConfig = require('../../conf/forTesting/config.multi.test');
const proxyquire = require('proxyquire').noCallThru();
const mockStore = require('../mocks/mockStore');
const expect = require('chai').expect;
const provider = require('../../lib/provider/immoscout');

describe('#immoscout testsuite()', () => {
  provider.init(mockConfig.jobs.test1.provider.immoscout, [], []);
  const Fredy = proxyquire('../../lib/FredyRuntime', {
    './services/store': mockStore,
    './notification/notify': mockNotification
  });

  it('should test immoscout provider', async () => {
    return await new Promise(resolve => {
      const fredy = new Fredy(provider.config, null, provider.id(), 'test1');
      fredy.execute().then(() => {
        const immoscoutDbContent = fredy._getStore()._db;
        expect(immoscoutDbContent.immoscout).to.be.a('array');

        const notificationObj = mockNotification.get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('immoscout');

        notificationObj.payload.forEach((notify, idx) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('number');
          expect(notify.price).to.be.a('string');
          expect(notify.size).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.link).to.be.a('string');
          expect(notify.address).to.be.a('string');

          /** check the values if possible **/
          expect(notify.id).to.equal(immoscoutDbContent.immoscout[idx]);
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
