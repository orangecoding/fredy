const mockNotification = require('./mocks/mockNotification');
const mockConfig = require('../conf/config.test');
const mockStore = require('./mocks/mockStore');
const mockStats = require('./mocks/mockStats');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;

describe('#kalaydo testsuite()', () => {

    const kalaydo = proxyquire('../lib/provider/kalaydo', {
        '../../conf/config.json': mockConfig,
        '../lib/fredy': proxyquire('../lib/fredy', {
            './services/store': mockStore,
            './notification/notify': mockNotification
        })
    });

    it('should test kalaydo provider', async () => {
        return await new Promise(resolve => {
            kalaydo.run(mockStats).then(() => {
                const kalaydoDbContent = kalaydo._getStore()._db;

                expect(kalaydoDbContent.kalaydo).to.be.a('array');


                const notificationObj = mockNotification.get();
                expect(notificationObj).to.be.a('object');
                expect(notificationObj.serviceName).to.equal('kalaydo');

                /** check the actual structure **/
                expect(notificationObj.payload.id).to.be.a('string');
                expect(notificationObj.payload.price).to.be.a('string');
                expect(notificationObj.payload.size).to.be.a('string');
                expect(notificationObj.payload.title).to.be.a('string');
                expect(notificationObj.payload.link).to.be.a('string');

                /** check the values if possible **/
                expect(notificationObj.payload.id).to.equal(kalaydoDbContent.kalaydo[kalaydoDbContent.kalaydo.length - 1]);
                expect(notificationObj.payload.price).that.does.include('€');
                expect(notificationObj.payload.size).that.does.include('m²');
                expect(notificationObj.payload.title).to.be.not.empty;
                expect(notificationObj.payload.link).that.does.include('https://www.kalaydo.de');

                resolve();
            });
        });
    });
});
