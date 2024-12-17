import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
//import {get} from '../mocks/mockNotification.js';
import {/*mockFredy, */providerConfig} from '../utils.js';
//import {expect} from 'chai';
import * as provider from '../../lib/provider/immoscout.js';

describe('#immoscout testsuite()', () => {
    after(() => {
        similarityCache.stopCacheCleanup();
    });
    provider.init(providerConfig.immoscout, [], []);
    it('should test immoscout provider', async () => {
        //const Fredy = await mockFredy();
        return await new Promise((resolve) => {
            /* eslint-disable no-console */
            console.info('Skipping Immoscout test for now until we figured out how to surpass bot detection.');
            /* eslint-enable no-console */
            resolve();
            /*
            const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'immoscout', similarityCache);
            fredy.execute().then((listing) => {
                expect(listing).to.be.a('array');
                const notificationObj = get();
                expect(notificationObj).to.be.a('object');
                expect(notificationObj.serviceName).to.equal('immoscout');
                notificationObj.payload.forEach((notify) => {
                    expect(notify.id).to.be.a('number');
                    expect(notify.price).to.be.a('string');
                    expect(notify.size).to.be.a('string');
                    expect(notify.title).to.be.a('string');
                    expect(notify.link).to.be.a('string');
                    expect(notify.address).to.be.a('string');
                    expect(notify.price).that.does.include('€');
                    expect(notify.size).that.does.include('m²');
                    expect(notify.title).to.be.not.empty;
                    expect(notify.link).that.does.include('https://www.immobilienscout24.de');
                    expect(notify.address).to.be.not.empty;
                });
                resolve();
            });*/
        });
    });
});
