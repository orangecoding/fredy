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
                    expect(notify.size).that.does.include('m²');
                    expect(notify.title).to.be.not.empty;
                    expect(notify.link).that.does.include('https://www.1a-immobilienmarkt.de');
                });
                resolve();
            });
        });
    });
});
