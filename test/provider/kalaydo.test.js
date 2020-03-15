const mockNotification = require('../mocks/mockNotification');
const mockConfig = require('../../conf/forTesting/config.multi.test');
const mockStore = require('../mocks/mockStore');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;
const provider = require('../../lib/provider/kalaydo');

describe('#kalaydo testsuite()', () => {
  provider.init(mockConfig.jobs.test1.provider.kalaydo, [], []);
  const Fredy = proxyquire('../../lib/FredyRuntime', {
    './services/store': mockStore,
    './notification/notify': mockNotification
  });

  it.only('should test kalaydo provider', async () => {
    return await new Promise(resolve => {
      const fredy = new Fredy(provider.config, null, provider.id(), 'test1');
      fredy.execute().then(() => {
        const kalaydoDbContent = fredy._getStore();

        expect(kalaydoDbContent.kalaydo).to.be.a('array');

        const notificationObj = mockNotification.get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('kalaydo');

        notificationObj.payload.forEach((notify, idx) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('string');
          expect(notify.price).to.be.a('string');
          expect(notify.size).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.link).to.be.a('string');

          /** check the values if possible **/
          expect(notify.id).to.equal(kalaydoDbContent.kalaydo[idx]);
          expect(notify.title).to.be.not.empty;
          expect(notify.link).that.does.include('https://www.kalaydo.de');
        });
        resolve();
      });
    });
  });
});
