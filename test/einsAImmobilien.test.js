const mockNotification = require('./mocks/mockNotification');
const mockConfig = require('../conf/config.test');
const mockStore = require('./mocks/mockStore');
const mockStats = require('./mocks/mockStats');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;

describe('#einsAImmobilien testsuite()', () => {

    const einsAImmobilien = proxyquire('../lib/provider/einsAImmobilien', {
        '../../conf/config.json': mockConfig,
        '../lib/fredy': proxyquire('../lib/fredy', {
            './services/store': mockStore,
            './notification/notify': mockNotification
        })
    });

    it('should test einsAImmobilien provider', async () => {
        return await new Promise(resolve => {
            einsAImmobilien.run(mockStats).then(() => {
                const immonetDbContent = einsAImmobilien._getStore()._db;

                expect(immonetDbContent.einsAImmobilien).to.be.a('array');

                // const notificationObj = mockNotification.get();
                // expect(notificationObj).to.be.a('object');
                // expect(notificationObj.serviceName).to.equal('einsAImmobilien');
                //
                // /** check the actual structure **/
                // expect(notificationObj.payload.id).to.be.a('number');
                // expect(notificationObj.payload.price).to.be.a('string');
                // expect(notificationObj.payload.size).to.be.a('string');
                // expect(notificationObj.payload.title).to.be.a('string');
                // expect(notificationObj.payload.link).to.be.a('string');
                // expect(notificationObj.payload.address).to.be.a('string');
                //
                // /** check the values if possible **/
                // expect(notificationObj.payload.id).to.equal(immonetDbContent.immonet[immonetDbContent.immonet.length - 1]);
                // expect(notificationObj.payload.price).that.does.include('€');
                // expect(notificationObj.payload.size).that.does.include('m²');
                // expect(notificationObj.payload.title).to.be.not.empty;
                // expect(notificationObj.payload.link).that.does.include('https://www.immonet.de');
                // expect(notificationObj.payload.address).to.be.not.empty;

                resolve();
            });
        });
    });
});
