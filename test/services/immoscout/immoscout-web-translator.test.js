/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { convertWebToMobile } from '../../../lib/services/immoscout/immoscout-web-translator.js';
import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';
import { buildFetchMock } from '../../offlineFixtures.js';

export const testData = JSON.parse(await readFile(new URL('./testdata.json', import.meta.url), 'utf8'));

if (process.env.TEST_MODE === 'offline') {
  vi.stubGlobal('fetch', buildFetchMock());
}

describe('#immoscout-mobile URL conversion', () => {
  // Test shape URL conversion
  it('should convert a full web URL with shape to mobile URL', () => {
    const webUrl =
      'https://www.immobilienscout24.de/Suche/shape/haus-kaufen?shape=aW9yfkhfa3htQXJgUGlnYEBmekhte3BAcXNAfWBsQGNyQ2lkUHVvbEB3eX5Ab25WYn5Fa2BLaGRQY29FaGtTfEhme3xBdHBEdHFMamlHbmdRfHhMcmxPeHlWYnpS&price=-600000.0&ground=240.0-&enteredFrom=result_list';
    const expectedMobileUrl =
      'https://api.mobile.immobilienscout24.de/search/list?exclusioncriteria=swapflat&ground=240.0-&price=-600000.0&realestatetype=housebuy&searchType=shape&shape=ior~H_kxmAr%60Pig%60%40fzHm%7Bp%40qs%40%7D%60l%40crCidPuol%40wy~%40onVb~Ek%60KhdPcoEhkS%7CHf%7B%7CAtpDtqLjiGngQ%7CxLrlOxyVbzR';

    const actualMobileUrl = convertWebToMobile(webUrl);
    expect(actualMobileUrl).toBe(expectedMobileUrl);
  });

  // A shape drawn by hand on the map arrives as a bare polyline rather than base64. Decoding one of
  // those does not throw, it quietly returns broken UTF-8, and ImmoScout answers 400 "Cannot parse
  // shape", so the polyline has to reach the mobile API byte for byte.
  it('should pass a raw polyline shape through untouched', () => {
    const polyline =
      '}{jwHy|qh@jCKdCgAvB_BdB}BzAaCjAqCfAqC~@uCt@iCh@eCZkCLyC?_EO}Ea@}Ea@iE_@{D]aDe@gDi@gDo@uCu@kBcB_AeDOiE?iDCgCMuBOkDCkG?yFRgD`@cB\\{A`@eBx@aB|@kAbAy@rAe@bBUxCAhE?dFh@fGlAzGbBbHlBxGdB`FrAhDz@xBh@nAf@l@RNNXkCkMJR~B|EnCpErCnDtClCvC~ApCh@rCJpC?';
    const webUrl = `https://www.immobilienscout24.de/Suche/shape/haus-kaufen?shape=${encodeURIComponent(polyline)}&price=-600000.0`;

    const shape = new URL(convertWebToMobile(webUrl)).searchParams.get('shape');

    expect(shape).toBe(polyline);
    // U+FFFD is what a base64 decode of a polyline leaves behind, and the symptom the API rejects.
    expect(shape).not.toContain('�');
  });

  // The base64 flavour uses `.` where base64 would use `=`, because a bare `=` in a query string
  // value is asking for trouble. Both padding lengths have to survive the substitution, so the two
  // polylines below are picked for byte lengths that pad to `..` and to `.` respectively.
  it.each([
    ['..', 'ymrwHidih@`IkS_Aal@oTsVoViClw@g'],
    ['.', 'ymrwHidih@`IkS_Aal@oTsVoViClw@g@'],
  ])('should decode a base64 shape padded with %s', (padding, polyline) => {
    const padded = Buffer.from(polyline, 'utf-8').toString('base64').replace(/=+$/, padding);
    expect(padded.endsWith(padding)).toBe(true);
    const webUrl = `https://www.immobilienscout24.de/Suche/shape/haus-kaufen?shape=${encodeURIComponent(padded)}`;

    expect(new URL(convertWebToMobile(webUrl)).searchParams.get('shape')).toBe(polyline);
  });

  // Base64 that decodes to bytes no polyline could contain is not a shape we can use. Sending the
  // mangled decode would be strictly worse than sending what we were given, so the input wins.
  it('should keep the original value when a base64 decode yields no polyline', () => {
    const shape = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]).toString('base64');
    const webUrl = `https://www.immobilienscout24.de/Suche/shape/haus-kaufen?shape=${encodeURIComponent(shape)}`;

    expect(new URL(convertWebToMobile(webUrl)).searchParams.get('shape')).toBe(shape);
  });

  // Test URL conversion
  it('should convert a full web URL to mobile URL', () => {
    const webUrl =
      'https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mieten?heatingtypes=central,selfcontainedcentral&haspromotion=false&numberofrooms=2.0-5.0&livingspace=10.0-25.0&energyefficiencyclasses=a,b,c,d,e,f,g,h,a_plus&exclusioncriteria=projectlisting,swapflat&equipment=parking,cellar,builtinkitchen,lift,garden,guesttoilet,balcony&petsallowedtypes=no,yes,negotiable&price=10.0-100.0&constructionyear=1920-2026&apartmenttypes=halfbasement,penthouse,other,loft,groundfloor,terracedflat,raisedgroundfloor,roofstorey,apartment,maisonette&pricetype=calculatedtotalrent&floor=2-7&enteredFrom=result_list';
    const expectedMobileUrl =
      'https://api.mobile.immobilienscout24.de/search/list?apartmenttypes=halfbasement,penthouse,other,loft,groundfloor,terracedflat,raisedgroundfloor,roofstorey,apartment,maisonette&constructionyear=1920-2026&energyefficiencyclasses=a,b,c,d,e,f,g,h,a_plus&equipment=parking,cellar,builtInKitchen,lift,garden,guestToilet,balcony&exclusioncriteria=swapflat,projectlisting&floor=2-7&geocodes=%2Fde%2Fberlin%2Fberlin&haspromotion=false&heatingtypes=central,selfcontainedcentral&livingspace=10.0-25.0&numberofrooms=2.0-5.0&petsallowedtypes=no,yes,negotiable&price=10.0-100.0&pricetype=calculatedtotalrent&realestatetype=apartmentrent&searchType=region';

    const actualMobileUrl = convertWebToMobile(webUrl);
    expect(actualMobileUrl).toBe(expectedMobileUrl);
  });

  // The mobile API now uses swapflat directly for the default rental filter.
  it('should default exclusioncriteria to swapflat for regular apartment searches', () => {
    const webUrl = 'https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mieten?price=-1500.0';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('exclusioncriteria')).toBe('swapflat');
  });

  // Values that are spelled differently on the web must be translated for the
  // mobile API, while swapflat stays unchanged.
  it('should translate projectlisting and keep swapflat', () => {
    const webUrl =
      'https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mieten?exclusioncriteria=projectlisting,swapflat';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('exclusioncriteria').split(',').sort()).toEqual(['projectlisting', 'swapflat']);
  });

  // Bestandswohnungen use the projectlisting exclusion by default.
  it('should set exclusioncriteria=projectlisting for bestandswohnung-mieten', () => {
    const webUrl = 'https://www.immobilienscout24.de/Suche/de/berlin/berlin/bestandswohnung-mieten';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('exclusioncriteria').split(',').sort()).toEqual(['projectlisting', 'swapflat']);
  });

  // Exchange-apartment searches must not inherit the swapflat default, but any
  // explicit exclusioncriteria from the URL should still pass through.
  it('should remove the swapflat default for mietwohnungen-mit-tauschwohnungen', () => {
    const webUrl =
      'https://www.immobilienscout24.de/Suche/de/berlin/berlin/mietwohnungen-mit-tauschwohnungen?exclusioncriteria=projectlisting';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('exclusioncriteria')).toBe('projectlisting');
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

  // Buy-side apartment sub-type SEO paths.
  it.each([
    ['souterrainwohnung-kaufen', 'halfbasement'],
    ['erdgeschosswohnung-kaufen', 'groundfloor'],
    ['hochparterrewohnung-kaufen', 'raisedgroundfloor'],
    ['etagenwohnung-kaufen', 'apartment'],
    ['loft-kaufen', 'loft'],
    ['maisonette-kaufen', 'maisonette'],
    ['terrassenwohnung-kaufen', 'terracedflat'],
    ['penthouse-kaufen', 'penthouse'],
    ['dachgeschosswohnung-kaufen', 'roofstorey'],
  ])('should convert %s to apartmentbuy with apartmenttype %s', (slug, apartmentType) => {
    const webUrl = `https://www.immobilienscout24.de/Suche/de/berlin/berlin/${slug}`;

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('realestatetype')).toBe('apartmentbuy');
    expect(queryParams.get('apartmenttypes')).toBe(apartmentType);
  });

  // Buy-side equipment/feature SEO paths follow the same "-kaufen" suffix
  // pattern as the apartment sub-types above (also verified live).
  it.each([
    ['wohnung-mit-garage-kaufen', 'parking'],
    ['wohnung-mit-einbaukueche-kaufen', 'builtinkitchen'],
    ['wohnung-mit-keller-kaufen', 'cellar'],
    ['barrierefreie-wohnung-kaufen', 'handicappedaccessible'],
  ])('should convert %s to apartmentbuy with equipment %s', (slug, equipment) => {
    const webUrl = `https://www.immobilienscout24.de/Suche/de/berlin/berlin/${slug}`;

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('realestatetype')).toBe('apartmentbuy');
    expect(queryParams.get('equipment')).toBe(equipment);
  });

  it('should convert neubauwohnung-kaufen to apartmentbuy with newbuilding=true', () => {
    const webUrl = 'https://www.immobilienscout24.de/Suche/de/berlin/berlin/neubauwohnung-kaufen';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('realestatetype')).toBe('apartmentbuy');
    expect(queryParams.get('newbuilding')).toBe('true');
  });

  // "Anlageimmobilien" is its own real estate type on the mobile API and its web
  // path carries neither a "-kaufen" nor a "-mieten" suffix.
  it('should convert anlageimmobilie to the investment real estate type', () => {
    const webUrl = 'https://www.immobilienscout24.de/Suche/de/berlin/berlin/anlageimmobilie';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('realestatetype')).toBe('investment');
    expect(queryParams.get('geocodes')).toBe('/de/berlin/berlin');
  });

  // Sanity check: the corresponding "-mieten" slugs must remain untouched
  // by the suffix-based realType resolution introduced above.
  it.each([
    ['souterrainwohnung-mieten', 'halfbasement'],
    ['dachgeschosswohnung-mieten', 'roofstorey'],
  ])('should keep %s resolving to apartmentrent with apartmenttype %s', (slug, apartmentType) => {
    const webUrl = `https://www.immobilienscout24.de/Suche/de/berlin/berlin/${slug}`;

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('realestatetype')).toBe('apartmentrent');
    expect(queryParams.get('apartmenttypes')).toBe(apartmentType);
  });

  // House SEO paths. The web UI folds a single house filter into the path itself, so
  // "Haus kaufen" plus the Garage filter arrives as "haus-mit-garage-kaufen" and never as
  // "haus-kaufen?equipment=parking". Unmapped, such a path has no real estate type at all and the
  // job dies on "Real estate type not found" (#378). Each expectation below is the search
  // ImmoScout's own web app resolves that path to.
  it.each([
    ['haus-mit-garage-kaufen', 'housebuy', 'equipment', 'parking'],
    ['haus-mit-garage-mieten', 'houserent', 'equipment', 'parking'],
    ['haus-mit-keller-kaufen', 'housebuy', 'equipment', 'cellar'],
    ['haus-mit-keller-mieten', 'houserent', 'equipment', 'cellar'],
    ['einfamilienhaus-kaufen', 'housebuy', 'buildingtypes', 'singlefamilyhouse'],
    ['einfamilienhaus-mieten', 'houserent', 'buildingtypes', 'singlefamilyhouse'],
    ['doppelhaushaelfte-kaufen', 'housebuy', 'buildingtypes', 'semidetachedhouse'],
    ['reihenhaus-kaufen', 'housebuy', 'buildingtypes', 'terracehouse'],
    ['reihenhaus-mieten', 'houserent', 'buildingtypes', 'terracehouse'],
    ['bungalow-kaufen', 'housebuy', 'buildingtypes', 'bungalow'],
    ['mehrfamilienhaus-kaufen', 'housebuy', 'buildingtypes', 'multifamilyhouse'],
    ['bauernhaus-kaufen', 'housebuy', 'buildingtypes', 'farmhouse'],
    ['villa-kaufen', 'housebuy', 'buildingtypes', 'villa'],
    ['villa-mieten', 'houserent', 'buildingtypes', 'villa'],
    ['neubauhaus-kaufen', 'housebuy', 'newbuilding', 'true'],
    ['neubauhaus-mieten', 'houserent', 'newbuilding', 'true'],
    ['luxushaus-kaufen', 'housebuy', 'luxurypromotion', 'true'],
  ])('should convert %s to %s with %s=%s', (slug, realEstateType, param, value) => {
    const webUrl = `https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/${slug}`;

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('realestatetype')).toBe(realEstateType);
    expect(queryParams.get(param)).toBe(value);
    expect(queryParams.get('geocodes')).toBe('/de/nordrhein-westfalen/duesseldorf');
  });

  // The filter folded into the path must survive alongside the remaining query params.
  it('should keep the query params of a house SEO path', () => {
    const webUrl =
      'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/haus-mit-garage-kaufen?price=-600000.0&livingspace=120.0-&enteredFrom=result_list';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('realestatetype')).toBe('housebuy');
    expect(queryParams.get('equipment')).toBe('parking');
    expect(queryParams.get('price')).toBe('-600000.0');
    expect(queryParams.get('livingspace')).toBe('120.0-');
  });

  // A house SEO path can be combined with an explicit buildingtypes filter, in which case the
  // query param is the one the web app keeps.
  it('should let an explicit buildingtypes param override the house SEO path', () => {
    const webUrl =
      'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/einfamilienhaus-kaufen?buildingtypes=bungalow';

    const converted = convertWebToMobile(webUrl);
    expect(new URL(converted).searchParams.get('buildingtypes')).toBe('bungalow');
  });

  // Only the buy side of "luxushaus" exists on the web (the rent path answers 410), so no
  // houserent mapping may be invented for it.
  it('should not map luxushaus-mieten', () => {
    const webUrl = 'https://www.immobilienscout24.de/Suche/de/berlin/berlin/luxushaus-mieten';

    expect(() => convertWebToMobile(webUrl)).toThrow('Real estate type not found: luxushaus-mieten');
  });

  // The tenantNetwork flag opts into the mobile API's "Mieter-Netzwerk" pool.
  it('should forward the tenantNetwork flag when present in the web URL', () => {
    const webUrl =
      'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/neuss-rhein-kreis/rommerskirchen/wohnung-mieten?enteredFrom=result_list&tenantNetwork=true';

    const converted = convertWebToMobile(webUrl);
    const queryParams = new URL(converted).searchParams;
    expect(queryParams.get('tenantNetwork')).toBe('true');
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
          'User-Agent': 'ImmoScout_28.1_26.5.2_._',
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
