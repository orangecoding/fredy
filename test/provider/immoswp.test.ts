import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'chai... Remove this comment to see the full error message
import { expect } from 'chai';
import * as provider from '../../lib/provider/immoswp.js';

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('#immoswp testsuite()', () => {
  // @ts-expect-error TS(2304): Cannot find name 'after'.
  after(() => {
    similarityCache.stopCacheCleanup();
  });
  // @ts-expect-error TS(2554): Expected 2 arguments, but got 3.
  provider.init(providerConfig.immoswp, [], []);
  // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
  it('should test immoswp provider', async () => {
    const Fredy = await mockFredy();
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, 'immoswp', similarityCache);
      fredy.execute().then((listing: any) => {
        expect(listing).to.be.a('array');
        const notificationObj = get();
        expect(notificationObj).to.be.a('object');
        // @ts-expect-error TS(2339): Property 'serviceName' does not exist on type '{}'... Remove this comment to see the full error message
        expect(notificationObj.serviceName).to.equal('immoswp');
        // @ts-expect-error TS(2339): Property 'payload' does not exist on type '{}'.
        notificationObj.payload.forEach((notify: any) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('string');
          expect(notify.price).to.be.a('string');
          expect(notify.size).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.link).to.be.a('string');
          /** check the values if possible **/
          expect(notify.price).that.does.include('€');
          expect(notify.title).to.be.not.empty;
          expect(notify.link).that.does.include('https://immo.swp.de');
        });
        // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
        resolve();
      });
    });
  });
});
