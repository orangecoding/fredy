const mockNotification = require('../mocks/mockNotification');
const providerConfig = require('./testProvider.json');
const mockStore = require('../mocks/mockStore');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;
const provider = require('../../lib/provider/immowelt');

describe('#immowelt testsuite()', () => {
  it('should test immowelt provider', async () => {
    provider.init(providerConfig.immowelt, [], []);
    const Fredy = proxyquire('../../lib/FredyRuntime', {
      './services/storage/listingsStorage': {
        ...mockStore,
      },
      './notification/notify': mockNotification,
    });

    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'test1');
      fredy.execute().then((listing) => {
        expect(listing).to.be.a('array');

        const notificationObj = mockNotification.get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('immowelt');

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
          if (notify.size.trim().toLowerCase() !== 'k.a.') {
            expect(notify.size).that.does.include('m²');
          }
          expect(notify.title).to.be.not.empty;
          expect(notify.link).that.does.include('https://www.immowelt.de');
          expect(notify.address).to.be.not.empty;
        });
        resolve();
      });
    });
  });
});
