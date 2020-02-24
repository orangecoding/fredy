const mockNotification = require('./mocks/mockNotification');
const mockConfig = require('../conf/config.test');
const mockStore = require('./mocks/mockStore');
const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;
const provider = require('../lib/provider/immowelt');

describe('#immowelt testsuite()', () => {

    it('should test immowelt provider', async () => {
        provider.init(mockConfig.jobs.test1.provider.immowelt, [], []);
        const Fredy = proxyquire('../lib/FredyRuntime', {
            './services/store': mockStore,
            './notification/notify': mockNotification
        });

        return await new Promise(resolve => {
            const fredy = new Fredy(provider.config, null, provider.id(), 'test1');
            fredy.execute().then(() => {
                const immoweltDbContent = fredy._getStore()._db;
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
                    if(notify.size.trim().toLowerCase() !== 'k.a.') {
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
