const mockNotification = require('./mocks/mockNotification');
const mockConfig = require('../conf/config.test');
const mockStore = require('./mocks/mockStore');
const mockStats = require('./mocks/mockStats');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;

describe('#neubauKompass testsuite()', () => {

    const neubauKompass = proxyquire('../lib/provider/neubauKompass', {
        '../../conf/config.json': mockConfig,
        '../lib/fredy': proxyquire('../lib/fredy', {
            './services/store': mockStore,
            './notification/notify': mockNotification
        })
    });

    it('should test neubauKompass provider', async () => {
        return await new Promise(resolve => {
            neubauKompass.run(mockStats).then(() => {
                const neubauKompassDbContent = neubauKompass._getStore()._db;
                expect(neubauKompassDbContent.neubauKompass).to.be.a('array');

                const notificationObj = mockNotification.get();
                expect(notificationObj.serviceName).to.equal('neubauKompass');

                notificationObj.payload.forEach((notify, idx) => {
                expect(notify).to.be.a('object');

                /** check the actual structure **/
                expect(notify.id).to.be.a('string');
                expect(notify.title).to.be.a('string');
                expect(notify.link).to.be.a('string');
                expect(notify.address).to.be.a('string');

                /** check the values if possible **/
                expect(notify.id).to.equal(neubauKompassDbContent.neubauKompass[idx]);
                expect(notify.title).to.be.not.empty;
                expect(notify.link).that.does.include('https://www.neubaukompass.de');
                expect(notify.address).to.be.not.empty;
                });
                resolve();
            });
        });
    });
});
