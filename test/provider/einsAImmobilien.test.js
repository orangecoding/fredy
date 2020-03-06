const mockNotification = require('../mocks/mockNotification');
const mockConfig = require('../../conf/forTesting/config.multi.test');
const mockStore = require('../mocks/mockStore');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;
const provider = require('../../lib/provider/einsAImmobilien');

describe('#einsAImmobilien testsuite()', () => {
  provider.init(mockConfig.jobs.test1.provider.einsAImmobilien, [], []);
  const Fredy = proxyquire('../../lib/FredyRuntime', {
    './services/store': mockStore,
    './notification/notify': mockNotification
  });

  it('should test einsAImmobilien provider', async () => {
    return await new Promise(resolve => {
      const fredy = new Fredy(provider.config, null, provider.id(), 'test1');
      fredy.execute().then(() => {
        const immonetDbContent = fredy._getStore();
        expect(immonetDbContent.einsAImmobilien).to.be.a('array');

        const notificationObj = mockNotification.get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('einsAImmobilien');

        notificationObj.payload.forEach((notify, idx) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('number');
          expect(notify.price).to.be.a('string');
          expect(notify.size).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.link).to.be.a('string');

          /** check the values if possible **/
          expect(notify.id).to.equal(immonetDbContent.einsAImmobilien[idx]);
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
