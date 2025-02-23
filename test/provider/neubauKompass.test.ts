import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import {get} from '../mocks/mockNotification.js';
import {mockFredy, providerConfig} from '../utils.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'chai... Remove this comment to see the full error message
import {expect} from 'chai';
import * as provider from '../../lib/provider/neubauKompass.js';

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('#neubauKompass testsuite()', () => {
    // @ts-expect-error TS(2304): Cannot find name 'after'.
    after(() => {
        similarityCache.stopCacheCleanup();
    });
    // @ts-expect-error TS(2554): Expected 2 arguments, but got 3.
    provider.init(providerConfig.neubauKompass, [], []);
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should test neubauKompass provider', async () => {
        const Fredy = await mockFredy();
        return await new Promise((resolve) => {
            const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'neubauKompass', similarityCache);
            fredy.execute().then((listing: any) => {
                expect(listing).to.be.a('array');
                const notificationObj = get();
                // @ts-expect-error TS(2339): Property 'serviceName' does not exist on type '{}'... Remove this comment to see the full error message
                expect(notificationObj.serviceName).to.equal('neubauKompass');
                // @ts-expect-error TS(2339): Property 'payload' does not exist on type '{}'.
                notificationObj.payload.forEach((notify: any) => {
                    expect(notify).to.be.a('object');
                    /** check the actual structure **/
                    expect(notify.id).to.be.a('string');
                    expect(notify.title).to.be.a('string');
                    expect(notify.link).to.be.a('string');
                    expect(notify.address).to.be.a('string');
                    /** check the values if possible **/
                    expect(notify.title).to.be.not.empty;
                    expect(notify.link).that.does.include('https://www.neubaukompass.de');
                    expect(notify.address).to.be.not.empty;
                });
                // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                resolve();
            });
        });
    });
});
