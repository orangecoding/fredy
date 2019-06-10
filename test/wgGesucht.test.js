const mockNotification = require('./mocks/mockNotification');
const mockConfig = require('../conf/config.test');
const mockStore = require('./mocks/mockStore');
const mockStats = require('./mocks/mockStats');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;

describe('#wgGesucht testsuite()', () => {

    const wgGesucht = proxyquire('../lib/provider/wgGesucht', {
        '../../conf/config.json': mockConfig,
        '../lib/fredy': proxyquire('../lib/fredy', {
            './services/store': mockStore,
            './notification/notify': mockNotification
        })
    });

    it('should test wgGesucht provider', async () => {
        return await new Promise(resolve => {
            wgGesucht.run(mockStats).then(() => {
                const wgGesuchtDbContent = wgGesucht._getStore()._db;
                expect(wgGesuchtDbContent.wgGesucht).to.be.a('array');
                const notificationObj = mockNotification.get();
                expect(notificationObj.serviceName).to.equal('wgGesucht');
                notificationObj.payload.forEach((notify, idx) => {
                    expect(notify).to.be.a('object');

                    /** check the actual structure **/

                    expect(notify.id).to.be.a('string');
                    expect(notify.title).to.be.a('string');
                    expect(notify.details).to.be.a('string');
                    expect(notify.description).to.be.a('string');
                    expect(notify.link).to.be.a('string');

                });
                resolve();
            });
        });
    });
});
