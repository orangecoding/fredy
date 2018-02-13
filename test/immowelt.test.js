const mockNotification = require('./mocks/mockNotification');
const mockConfig = require('../conf/config.test');
const mockStats = require('./mocks/mockStats');
const mockStore = require('./mocks/mockStore');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;

describe('#immowelt testsuite()', () => {

    it('should test immowelt provider', async () => {

        const immowelt = proxyquire('../lib/provider/immowelt', {
            '../../conf/config.json': mockConfig,
            '../lib/fredy': proxyquire('../lib/fredy', {
                './services/store': mockStore,
                './notification/notify': mockNotification
            })
        });

        return await new Promise(resolve => {
            immowelt.run(mockStats).then(() => {
                const immoweltDbContent = immowelt._getStore()._db;
                expect(immoweltDbContent.immowelt).to.be.a('array');

                const notificationObj = mockNotification.get();
                expect(notificationObj).to.be.a('object');
                expect(notificationObj.serviceName).to.equal('immowelt');

                notificationObj.payload.forEach((notify, idx) => {

                    /** check the actual structure **/
                    expect(notify.id).to.be.a('number');
                    expect(notify.price).to.be.a('string');
                    expect(notify.size).to.be.a('string');
                    expect(notify.title).to.be.a('string');
                    expect(notify.link).to.be.a('string');
                    expect(notify.address).to.be.a('string');

                    /** check the values if possible **/
                    expect(notify.id).to.equal(
                        immoweltDbContent.immowelt[idx]
                    );
                    expect(notify.price).that.does.include('€');
                    expect(notify.size).that.does.include('m²');
                    expect(notify.title).to.be.not.empty;
                    expect(notify.link).that.does.include('https://www.immowelt.de');
                    expect(notify.address).to.be.not.empty;
                });
                resolve();
            });
        });
    });
});
