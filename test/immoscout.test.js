const mockNotification = require('./mocks/mockNotification');
const mockConfig = require('../conf/config.test');
const mockStats = require('./mocks/mockStats');
const mockStore = require('./mocks/mockStore');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;

describe('#immoscout testsuite()', () => {

    const immoscout = proxyquire('../lib/provider/immoscout', {
        '../../conf/config.json': mockConfig,
        '../lib/fredy': proxyquire('../lib/fredy', {
            './services/store': mockStore,
            './notification/notify': mockNotification
        })
    });

    it('should test immoscout provider', async () => {
        return await new Promise(resolve => {
            immoscout.run(mockStats).then(() => {
                const immoscoutDbContent = immoscout._getStore()._db;
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
                    expect(notify.id).to.equal(
                        immoscoutDbContent.immoscout[idx]
                    );
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
