/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { convertWebToMobile } from '../../../lib/services/immoscout/immoscout-web-translator.js';
import { expect, vi } from 'vitest';
import { readFile } from 'fs/promises';
import { buildFetchMock } from '../../offlineFixtures.js';

export const testData = JSON.parse(await readFile(new URL('./testdata.json', import.meta.url)));

if (process.env.TEST_MODE === 'offline') {
  vi.stubGlobal('fetch', buildFetchMock());
}

describe('#immoscout-mobile URL conversion', () => {
  // Test shape URL conversion
  it('should convert a full web URL with shape to mobile URL', () => {
    const webUrl =
      'https://www.immobilienscout24.de/Suche/shape/haus-kaufen?shape=aW9yfkhfa3htQXJgUGlnYEBmekhte3BAcXNAfWBsQGNyQ2lkUHVvbEB3eX5Ab25WYn5Fa2BLaGRQY29FaGtTfEhme3xBdHBEdHFMamlHbmdRfHhMcmxPeHlWYnpS&price=-600000.0&ground=240.0-&enteredFrom=result_list';
    const expectedMobileUrl =
      'https://api.mobile.immobilienscout24.de/search/list?ground=240.0-&price=-600000.0&realestatetype=housebuy&searchType=shape&shape=ior~H_kxmAr%60Pig%60%40fzHm%7Bp%40qs%40%7D%60l%40crCidPuol%40wy~%40onVb~Ek%60KhdPcoEhkS%7CHf%7B%7CAtpDtqLjiGngQ%7CxLrlOxyVbzR';

    const actualMobileUrl = convertWebToMobile(webUrl);
    expect(actualMobileUrl).toBe(expectedMobileUrl);
  });

  // Test URL conversion
  it('should convert a full web URL to mobile URL', () => {
    const webUrl =
      'https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mieten?heatingtypes=central,selfcontainedcentral&haspromotion=false&numberofrooms=2.0-5.0&livingspace=10.0-25.0&energyefficiencyclasses=a,b,c,d,e,f,g,h,a_plus&exclusioncriteria=projectlisting,swapflat&equipment=parking,cellar,builtinkitchen,lift,garden,guesttoilet,balcony&petsallowedtypes=no,yes,negotiable&price=10.0-100.0&constructionyear=1920-2026&apartmenttypes=halfbasement,penthouse,other,loft,groundfloor,terracedflat,raisedgroundfloor,roofstorey,apartment,maisonette&pricetype=calculatedtotalrent&floor=2-7&enteredFrom=result_list';
    const expectedMobileUrl =
      'https://api.mobile.immobilienscout24.de/search/list?apartmenttypes=halfbasement,penthouse,other,loft,groundfloor,terracedflat,raisedgroundfloor,roofstorey,apartment,maisonette&constructionyear=1920-2026&energyefficiencyclasses=a,b,c,d,e,f,g,h,a_plus&equipment=parking,cellar,builtInKitchen,lift,garden,guestToilet,balcony&exclusioncriteria=projectlisting,swapflat&floor=2-7&geocodes=%2Fde%2Fberlin%2Fberlin&haspromotion=false&heatingtypes=central,selfcontainedcentral&livingspace=10.0-25.0&numberofrooms=2.0-5.0&petsallowedtypes=no,yes,negotiable&price=10.0-100.0&pricetype=calculatedtotalrent&realestatetype=apartmentrent&searchType=region';

    const actualMobileUrl = convertWebToMobile(webUrl);
    expect(actualMobileUrl).toBe(expectedMobileUrl);
  });

  // Test URL conversion of web-only SEO path
  it('should convert a SEO web path to the correct query params', () => {
    const webUrl = 'https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mit-balkon-mieten?equipment=garden';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('equipment').split(',')).toEqual(expect.arrayContaining(['garden', 'balcony']));
  });

  // Test URL conversion of SEO web path for max warmrent. The ImmoScout web UI
  // generates this special SEO slug instead of explicit price/pricetype params
  // when the user configures a "Warmmiete" filter (real-world URL).
  it('should convert a SEO apartment max warmrent path to rent + price + pricetype', () => {
    const webUrl =
      'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/wohnung-bis-800-euro-warm?livingspace=-800.0&enteredFrom=result_list';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('realestatetype')).toBe('apartmentrent');
    expect(queryParams.get('price')).toBe('-800');
    expect(queryParams.get('pricetype')).toBe('calculatedtotalrent');
    expect(queryParams.get('geocodes')).toBe('/de/nordrhein-westfalen/duesseldorf');
    expect(queryParams.get('livingspace')).toBe('-800.0');
  });

  // Same SEO pattern for houses ("haus-bis-X-euro-warm" → houserent).
  it('should convert a SEO house max warmrent path to rent + price + pricetype', () => {
    const webUrl = 'https://www.immobilienscout24.de/Suche/de/berlin/berlin/haus-bis-1500-euro-warm';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('realestatetype')).toBe('houserent');
    expect(queryParams.get('price')).toBe('-1500');
    expect(queryParams.get('pricetype')).toBe('calculatedtotalrent');
  });

  // Sanity check: max coldrent ("Kaltmiete") does NOT use an SEO slug. The web
  // UI keeps the regular "wohnung-mieten" path and passes explicit
  // price + pricetype query params, which the existing translator already
  // handles (real-world URL).
  it('should convert a max coldrent search via the regular wohnung-mieten path', () => {
    const webUrl =
      'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/wohnung-mieten?price=-800.0&livingspace=-800.0&pricetype=rentpermonth&enteredFrom=result_list';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('realestatetype')).toBe('apartmentrent');
    expect(queryParams.get('price')).toBe('-800.0');
    expect(queryParams.get('pricetype')).toBe('rentpermonth');
    expect(queryParams.get('geocodes')).toBe('/de/nordrhein-westfalen/duesseldorf');
  });

  // Explicit query params win over the SEO slug's implicit defaults.
  it('should let explicit query params override SEO path price defaults', () => {
    const webUrl = 'https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-bis-800-euro-warm?price=100-500';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('realestatetype')).toBe('apartmentrent');
    expect(queryParams.get('price')).toBe('100-500');
    expect(queryParams.get('pricetype')).toBe('calculatedtotalrent');
  });

  // Test URL conversion with unsupported query parameters
  it('should remove unsupported query parameters', () => {
    const webUrl = 'https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mieten?minimuminternetspeed=100000';
    const converted = convertWebToMobile(webUrl);
    expect(converted).not.toContain('minimuminternetspeed');
  });

  // Test URL conversion with invalid URL
  it('should throw an error for invalid URL', () => {
    const invalidUrl = 'invalid-url';

    expect(() => convertWebToMobile(invalidUrl)).toThrow('Invalid URL: invalid-url');
  });

  // Test URL conversion with unexpected path format
  it('should throw an error for unexpected path format', () => {
    const webUrl = 'https://www.immobilienscout24.de/invalid/path/format';
    expect(() => convertWebToMobile(webUrl)).toThrow('Unexpected path format: /invalid/path/format');
  });

  it('shouldFindResultsForEveryTestData', async () => {
    for (const webUrlKey of Object.keys(testData)) {
      const url = convertWebToMobile(testData[webUrlKey].url);
      const type = testData[webUrlKey].type;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'ImmoScout_27.12_26.2_._',
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

      expect([null, true]).toContain(response.ok);
      const responseBody = await response.json();
      expect(responseBody.totalResults).toBeGreaterThan(0);
      expect(responseBody.totalResults).toBeGreaterThan(0);
      expect(responseBody.resultListItems.length).toBeGreaterThan(0);
      expect(responseBody.resultListItems.filter((r) => r.type === 'EXPOSE_RESULT')[0].item.realEstateType).toBe(type);
    }
  });
});
