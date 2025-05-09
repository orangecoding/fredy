import { expect } from 'chai';
import { convertWebToMobile } from '../../lib/provider/immoscout.js';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import { get } from '../mocks/mockNotification.js';
import * as provider from '../../lib/provider/immoscout.js';

describe('#immoscout provider testsuite()', () => {
  after(() => {
    similarityCache.stopCacheCleanup();
  });

  provider.init(providerConfig.immoscout, [], []);
  it('should test immoscout provider', async () => {
    const Fredy = await mockFredy();
    return await new Promise((resolve) => {
      const fredy = new Fredy(provider.config, null, provider.metaInformation.id, '', similarityCache);
      fredy.execute().then((listings) => {
        expect(listings).to.be.a('array');
        const notificationObj = get();
        expect(notificationObj).to.be.a('object');
        expect(notificationObj.serviceName).to.equal('immoscout');
        notificationObj.payload.forEach((notify) => {
          /** check the actual structure **/
          expect(notify.id).to.be.a('string');
          expect(notify.price).to.be.a('string');
          expect(notify.size).to.be.a('string');
          expect(notify.title).to.be.a('string');
          expect(notify.link).to.be.a('string');
          expect(notify.address).to.be.a('string');
          /** check the values if possible **/
          expect(notify.size).to.be.not.empty;
          expect(notify.title).to.be.not.empty;
          expect(notify.link).that.does.include('https://www.immobilienscout24.de/');
        });
        resolve();
      });
    });
  });
});

describe('#immoscout-mobile URL conversion', () => {
  // Test URL conversion
  it('should convert a full web URL to mobile URL', () => {
    const webUrl =
      'https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mieten?heatingtypes=central,selfcontainedcentral&haspromotion=false&numberofrooms=2.0-5.0&livingspace=10.0-25.0&energyefficiencyclasses=a,b,c,d,e,f,g,h,a_plus&exclusioncriteria=projectlisting,swapflat&equipment=parking,cellar,builtinkitchen,lift,garden,guesttoilet,balcony&petsallowedtypes=no,yes,negotiable&price=10.0-100.0&constructionyear=1920-2026&apartmenttypes=halfbasement,penthouse,other,loft,groundfloor,terracedflat,raisedgroundfloor,roofstorey,apartment,maisonette&pricetype=calculatedtotalrent&floor=2-7&enteredFrom=result_list';
    const expectedMobileUrl =
      'https://api.mobile.immobilienscout24.de/search/list?apartmenttypes=halfbasement,penthouse,other,loft,groundfloor,terracedflat,raisedgroundfloor,roofstorey,apartment,maisonette&constructionyear=1920-2026&energyefficiencyclasses=a,b,c,d,e,f,g,h,a_plus&equipment=parking,cellar,builtInKitchen,lift,garden,guestToilet,balcony&exclusioncriteria=projectlisting,swapflat&floor=2-7&geocodes=%2Fde%2Fberlin%2Fberlin&haspromotion=false&heatingtypes=central,selfcontainedcentral&livingspace=10.0-25.0&numberofrooms=2.0-5.0&petsallowedtypes=no,yes,negotiable&price=10.0-100.0&pricetype=calculatedtotalrent&realestatetype=apartmentrent&searchType=region';

    const actualMobileUrl = convertWebToMobile(webUrl);
    expect(actualMobileUrl).to.equal(expectedMobileUrl);
  });

  // Test URL conversion with unsupported query parameters
  it('should throw an error for unsupported query parameters', () => {
    const webUrl = 'https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mieten?minimuminternetspeed=100000';

    expect(() => convertWebToMobile(webUrl)).to.throw('Unsupported Web-API parameter: "minimuminternetspeed"');
  });

  // Test URL conversion with invalid URL
  it('should throw an error for invalid URL', () => {
    const invalidUrl = 'invalid-url';

    expect(() => convertWebToMobile(invalidUrl)).to.throw('Invalid URL: invalid-url');
  });

  // Test URL conversion with unexpected path format
  it('should throw an error for unexpected path format', () => {
    const webUrl = 'https://www.immobilienscout24.de/invalid/path/format';

    expect(() => convertWebToMobile(webUrl)).to.throw('Unexpected path format: /invalid/path/format');
  });
});
