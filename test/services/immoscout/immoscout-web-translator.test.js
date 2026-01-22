/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { convertWebToMobile } from '../../../lib/services/immoscout/immoscout-web-translator.js';
import { expect } from 'chai';
import { readFile } from 'fs/promises';

export const testData = JSON.parse(await readFile(new URL('./testdata.json', import.meta.url)));

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

  // Test URL conversion of web-only SEO path
  it('should convert a SEO web path to the correct query params', () => {
    const webUrl = 'https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mit-balkon-mieten?equipment=garden';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('equipment').split(',')).to.include.members(['garden', 'balcony']);
  });

  // Test URL conversion with unsupported query parameters
  it('should remove unsupported query parameters', () => {
    const webUrl = 'https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mieten?minimuminternetspeed=100000';
    const converted = convertWebToMobile(webUrl);
    expect(converted).that.does.not.include('minimuminternetspeed');
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

  it('shouldFindResultsForEveryTestData', async () => {
    for (const webUrlKey of Object.keys(testData)) {
      const url = convertWebToMobile(testData[webUrlKey].url);
      const type = testData[webUrlKey].type;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'ImmoScout_27.3_26.0_._',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supportedResultListTypes: [],
          userData: {},
        }),
      });
      if (!response.ok) {
        console.error('Error fetching data from ImmoScout Mobile API:', response.statusText);
      }

      expect([null, true]).to.include(response.ok);
      const responseBody = await response.json();
      expect(responseBody.totalResults).to.be.greaterThan(0);
      expect(responseBody.totalResults).to.be.greaterThan(0);
      expect(responseBody.resultListItems.length).to.greaterThan(0);
      expect(responseBody.resultListItems[0].item.realEstateType).to.equal(type);
    }
  });
});
