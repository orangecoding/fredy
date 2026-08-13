/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  convertImmoscoutListingToMobileListing,
  convertWebToMobile,
  listKnownWebPaths,
} from '../../../lib/services/immoscout/immoscout-web-translator.js';
import logger from '../../../lib/services/logger.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';
import { buildFetchMock } from '../../offlineFixtures.js';

export const testData = JSON.parse(await readFile(new URL('./testdata.json', import.meta.url), 'utf8'));

if (process.env.TEST_MODE === 'offline') {
  vi.stubGlobal('fetch', buildFetchMock());
}

const DUESSELDORF = 'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf';
const BERLIN = 'https://www.immobilienscout24.de/Suche/de/berlin/berlin';

/** Converts a web URL and hands back its mobile query parameters. */
const paramsOf = (webUrl) => new URL(convertWebToMobile(webUrl)).searchParams;

describe('#immoscout-mobile URL conversion', () => {
  // The path tables and the per-type parameter rules have their own tests in web-paths.test.js and
  // param-support.test.js; what follows is the URL assembly on top of them.

  it('should convert a full web URL to mobile URL', () => {
    const webUrl = `${BERLIN}/wohnung-mieten?heatingtypes=central,selfcontainedcentral&haspromotion=false&numberofrooms=2.0-5.0&livingspace=10.0-25.0&energyefficiencyclasses=a,b,c,d,e,f,g,h,a_plus&exclusioncriteria=projectlisting,swapflat&equipment=parking,cellar,builtinkitchen,lift,garden,guesttoilet,balcony&petsallowedtypes=no,yes,negotiable&price=10.0-100.0&constructionyear=1920-2026&apartmenttypes=halfbasement,penthouse,other,loft,groundfloor,terracedflat,raisedgroundfloor,roofstorey,apartment,maisonette&pricetype=calculatedtotalrent&floor=2-7&enteredFrom=result_list`;
    const expectedMobileUrl =
      'https://api.mobile.immobilienscout24.de/search/list?apartmenttypes=halfbasement,penthouse,other,loft,groundfloor,terracedflat,raisedgroundfloor,roofstorey,apartment,maisonette&constructionyear=1920-2026&energyefficiencyclasses=a,b,c,d,e,f,g,h,a_plus&equipment=parking,cellar,builtinkitchen,lift,garden,guesttoilet,balcony&exclusioncriteria=projectlisting,swapflat&floor=2-7&geocodes=%2Fde%2Fberlin%2Fberlin&haspromotion=false&heatingtypes=central,selfcontainedcentral&livingspace=10.0-25.0&numberofrooms=2.0-5.0&petsallowedtypes=no,yes,negotiable&price=10.0-100.0&pricetype=calculatedtotalrent&realestatetype=apartmentrent&searchType=region';

    expect(convertWebToMobile(webUrl)).toBe(expectedMobileUrl);
  });

  it('should convert a full web URL with shape to mobile URL', () => {
    const webUrl =
      'https://www.immobilienscout24.de/Suche/shape/haus-kaufen?shape=aW9yfkhfa3htQXJgUGlnYEBmekhte3BAcXNAfWBsQGNyQ2lkUHVvbEB3eX5Ab25WYn5Fa2BLaGRQY29FaGtTfEhme3xBdHBEdHFMamlHbmdRfHhMcmxPeHlWYnpS&price=-600000.0&ground=240.0-&enteredFrom=result_list';
    const expectedMobileUrl =
      'https://api.mobile.immobilienscout24.de/search/list?ground=240.0-&price=-600000.0&realestatetype=housebuy&searchType=shape&shape=ior~H_kxmAr%60Pig%60%40fzHm%7Bp%40qs%40%7D%60l%40crCidPuol%40wy~%40onVb~Ek%60KhdPcoEhkS%7CHf%7B%7CAtpDtqLjiGngQ%7CxLrlOxyVbzR';

    expect(convertWebToMobile(webUrl)).toBe(expectedMobileUrl);
  });

  // The mobile API takes the equipment vocabulary exactly as the website spells it; the camel case
  // variants the translator used to build (builtInKitchen, guestToilet) return the same results, so
  // the values are forwarded untouched.
  it('should forward equipment values as the website spells them', () => {
    const webUrl = `${BERLIN}/wohnung-mieten?equipment=builtinkitchen,guesttoilet,handicappedaccessible`;

    expect(paramsOf(webUrl).get('equipment')).toBe('builtinkitchen,guesttoilet,handicappedaccessible');
  });

  describe('locations', () => {
    it('should take the region from the path', () => {
      const queryParams = paramsOf(`${DUESSELDORF}/wohnung-mieten`);

      expect(queryParams.get('searchType')).toBe('region');
      expect(queryParams.get('geocodes')).toBe('/de/nordrhein-westfalen/duesseldorf');
    });

    // Picking single districts replaces the path's city with numeric geocodes.
    it('should let numeric geocodes from the query replace the path region', () => {
      const webUrl =
        'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/haus-kaufen?geocodes=1276010037,1276010014';

      expect(paramsOf(webUrl).get('geocodes')).toBe('1276010037,1276010014');
    });

    it('should convert a radius search to geocoordinates', () => {
      const webUrl = `https://www.immobilienscout24.de/Suche/radius/haus-kaufen?centerofsearchaddress=D%C3%BCsseldorf&geocoordinates=51.22496%3B6.77567%3B5.0&price=1.0-1.0E7`;

      const queryParams = paramsOf(webUrl);
      expect(queryParams.get('searchType')).toBe('radius');
      expect(queryParams.get('geocoordinates')).toBe('51.22496;6.77567;5.0');
      expect(queryParams.get('geocodes')).toBeNull();
    });

    it('should carry a drawn shape over as a polyline', () => {
      const polyline = 'ior~H_kxmAr`Pig`@fzH';
      const webUrl = `https://www.immobilienscout24.de/Suche/shape/haus-kaufen?shape=${encodeURIComponent(polyline)}`;

      const queryParams = paramsOf(webUrl);
      expect(queryParams.get('searchType')).toBe('shape');
      expect(queryParams.get('shape')).toBe(polyline);
      expect(queryParams.get('geocodes')).toBeNull();
    });

    it('should throw when a shape search carries no shape', () => {
      expect(() =>
        convertWebToMobile('https://www.immobilienscout24.de/Suche/shape/haus-kaufen?price=-600000.0'),
      ).toThrow('Shape search URL is missing the required "shape" query parameter');
    });
  });

  describe('path filters', () => {
    // A filter the web UI folded into the path has to reach the mobile API as a parameter, or the
    // search silently widens to everything.
    it.each([
      ['haus-mit-garage-kaufen', 'housebuy', 'equipment', 'parking'],
      ['einfamilienhaus-mieten', 'houserent', 'buildingtypes', 'singlefamilyhouse'],
      ['penthouse-kaufen', 'apartmentbuy', 'apartmenttypes', 'penthouse'],
      ['neubauwohnung-mieten', 'apartmentrent', 'newbuilding', 'true'],
      ['luxushaus-kaufen', 'housebuy', 'luxurypromotion', 'true'],
      ['3-zimmer-wohnung-mieten', 'apartmentrent', 'numberofrooms', '3.0-3.5'],
      ['wg-zimmer', 'flatshareroom', 'geocodes', '/de/nordrhein-westfalen/duesseldorf'],
    ])('should turn %s into %s with %s=%s', (slug, realEstateType, param, value) => {
      const queryParams = paramsOf(`${DUESSELDORF}/${slug}`);

      expect(queryParams.get('realestatetype')).toBe(realEstateType);
      expect(queryParams.get(param)).toBe(value);
    });

    it('should keep the query params alongside the path filter', () => {
      const webUrl = `${DUESSELDORF}/haus-mit-garage-kaufen?price=-600000.0&livingspace=120.0-&enteredFrom=result_list`;

      const queryParams = paramsOf(webUrl);
      expect(queryParams.get('equipment')).toBe('parking');
      expect(queryParams.get('price')).toBe('-600000.0');
      expect(queryParams.get('livingspace')).toBe('120.0-');
    });

    it('should throw an error for a path we cannot map', () => {
      expect(() => convertWebToMobile(`${DUESSELDORF}/gewerbeflaeche-mieten`)).toThrow(
        'Real estate type not found: gewerbeflaeche-mieten',
      );
    });

    // The SEO slug for a maximum warm rent, and the coldrent search that uses no slug at all.
    it('should convert a SEO apartment max warmrent path to rent + price + pricetype', () => {
      const queryParams = paramsOf(`${DUESSELDORF}/wohnung-bis-800-euro-warm?livingspace=-800.0`);

      expect(queryParams.get('realestatetype')).toBe('apartmentrent');
      expect(queryParams.get('price')).toBe('-800');
      expect(queryParams.get('pricetype')).toBe('calculatedtotalrent');
      expect(queryParams.get('livingspace')).toBe('-800.0');
    });

    it('should convert a max coldrent search via the regular wohnung-mieten path', () => {
      const webUrl = `${DUESSELDORF}/wohnung-mieten?price=-800.0&livingspace=-800.0&pricetype=rentpermonth`;

      const queryParams = paramsOf(webUrl);
      expect(queryParams.get('price')).toBe('-800.0');
      expect(queryParams.get('pricetype')).toBe('rentpermonth');
    });
  });

  describe('precedence', () => {
    // Query parameters replace what the path implied, exactly as on the website:
    // "haus-mit-garage-kaufen?equipment=cellar" searches for a cellar, not for both.
    it('should let an explicit query param replace the path filter', () => {
      expect(paramsOf(`${DUESSELDORF}/haus-mit-garage-kaufen?equipment=cellar`).get('equipment')).toBe('cellar');
      expect(paramsOf(`${DUESSELDORF}/einfamilienhaus-kaufen?buildingtypes=bungalow`).get('buildingtypes')).toBe(
        'bungalow',
      );
      expect(paramsOf(`${BERLIN}/wohnung-bis-800-euro-warm?price=100-500`).get('price')).toBe('100-500');
    });

    it('should keep the path filter when the query says nothing about it', () => {
      expect(paramsOf(`${DUESSELDORF}/haus-mit-garage-kaufen?price=-600000.0`).get('equipment')).toBe('parking');
    });
  });

  describe('exclusion criteria', () => {
    // Rent apartment searches hide exchange flats unless the URL says otherwise.
    it('should default exclusioncriteria to swapflat for regular apartment searches', () => {
      expect(paramsOf(`${BERLIN}/wohnung-mieten?price=-1500.0`).get('exclusioncriteria')).toBe('swapflat');
    });

    it('should apply the swapflat default to apartment rent SEO paths too', () => {
      expect(paramsOf(`${BERLIN}/wohnung-mit-balkon-mieten`).get('exclusioncriteria')).toBe('swapflat');
    });

    // Houses and buy searches have no default at all - the website sends none either.
    it.each(['haus-mieten', 'haus-kaufen', 'wohnung-kaufen', 'anlageimmobilie'])(
      'should not add a default exclusion for %s',
      (slug) => {
        expect(paramsOf(`${BERLIN}/${slug}`).get('exclusioncriteria')).toBeNull();
      },
    );

    // An explicit list replaces the default rather than adding to it, which is what the website
    // does: "wohnung-mieten?exclusioncriteria=projectlisting" lets exchange flats back in.
    it('should let an explicit exclusioncriteria replace the default', () => {
      expect(paramsOf(`${BERLIN}/wohnung-mieten?exclusioncriteria=projectlisting`).get('exclusioncriteria')).toBe(
        'projectlisting',
      );
    });

    it('should pass every exclusion value through', () => {
      const webUrl = `${DUESSELDORF}/haus-kaufen?exclusioncriteria=projectlisting,foreclosure,unbuilthome`;

      expect(paramsOf(webUrl).get('exclusioncriteria').split(',').sort()).toEqual([
        'foreclosure',
        'projectlisting',
        'unbuilthome',
      ]);
    });

    it('should exclude projectlisting and swapflat for bestandswohnung-mieten', () => {
      expect(paramsOf(`${BERLIN}/bestandswohnung-mieten`).get('exclusioncriteria').split(',').sort()).toEqual([
        'projectlisting',
        'swapflat',
      ]);
    });

    it('should remove the swapflat default for mietwohnungen-mit-tauschwohnungen', () => {
      expect(paramsOf(`${BERLIN}/mietwohnungen-mit-tauschwohnungen`).get('exclusioncriteria')).toBeNull();
      expect(
        paramsOf(`${BERLIN}/mietwohnungen-mit-tauschwohnungen?exclusioncriteria=projectlisting`).get(
          'exclusioncriteria',
        ),
      ).toBe('projectlisting');
    });
  });

  describe('unsupported parameters', () => {
    beforeEach(() => vi.spyOn(logger, 'warn').mockImplementation(() => {}));
    afterEach(() => vi.restoreAllMocks());

    // A 412 from the mobile API makes the provider return nothing at all, so a filter the type does
    // not accept must not reach the URL. Which combination is legal is param-support.test.js's job.
    it.each([
      ['haspromotion=true', 'haus-kaufen', 'haspromotion'],
      ['ground=300.0-', 'wohnung-mieten', 'ground'],
      ['floor=2-7', 'haus-mieten', 'floor'],
      ['equipment=parking', 'anlageimmobilie', 'equipment'],
      ['pricetype=calculatedtotalrent', 'haus-mieten', 'pricetype'],
    ])('should drop %s on %s', (queryParam, slug, param) => {
      expect(paramsOf(`${DUESSELDORF}/${slug}?${queryParam}`).get(param)).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(param));
    });

    // Filters the translator used to throw away although the mobile API supports them.
    it.each([
      ['rented=true', 'haus-kaufen', 'rented', 'true'],
      ['minimuminternetspeed=100000', 'wohnung-mieten', 'minimuminternetspeed', '100000'],
      ['osmtags=subway,park', 'wohnung-mieten', 'osmtags', 'subway,park'],
      ['freeofcourtageonly=true', 'haus-kaufen', 'freeofcourtageonly', 'true'],
      ['sorting=-firstactivation', 'wg-zimmer', 'sorting', '-firstactivation'],
    ])('should forward %s on %s', (queryParam, slug, param, value) => {
      expect(paramsOf(`${DUESSELDORF}/${slug}?${queryParam}`).get(param)).toBe(value);
    });

    it('should remove the website noise without a word', () => {
      const converted = convertWebToMobile(
        `${BERLIN}/wohnung-mieten?enteredFrom=result_list&referrer=newsletter&utm_source=mail`,
      );

      expect(converted).not.toContain('enteredFrom');
      expect(converted).not.toContain('referrer');
      expect(converted).not.toContain('utm_source');
      expect(logger.warn).not.toHaveBeenCalled();
    });

    // A filter we have no translator for must be visible in the logs rather than vanishing: it is
    // the only signal that ImmoScout grew a filter Fredy does not know yet.
    it('should log a filter it has no translator for', () => {
      const converted = convertWebToMobile(`${BERLIN}/wohnung-mieten?listingtags=holzbalken`);

      expect(converted).not.toContain('listingtags');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('no translator for query parameter "listingtags=holzbalken"'),
      );
    });

    // The same has to hold for a filter folded into the path, so a slug table entry that names a
    // parameter nobody registered cannot go unnoticed either.
    it('should keep the location parameters out of the report', () => {
      convertWebToMobile(
        'https://www.immobilienscout24.de/Suche/radius/haus-kaufen?geocoordinates=51.2;6.7;5.0&centerofsearchaddress=D%C3%BCsseldorf',
      );

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('malformed input', () => {
    it('should throw an error for invalid URL', () => {
      expect(() => convertWebToMobile('invalid-url')).toThrow('Invalid URL: invalid-url');
    });

    it('should throw an error for unexpected path format', () => {
      expect(() => convertWebToMobile('https://www.immobilienscout24.de/invalid/path/format')).toThrow(
        'Unexpected path format: /invalid/path/format',
      );
    });
  });

  describe('expose URLs', () => {
    it('should rewrite a web expose URL to the mobile API', () => {
      expect(convertImmoscoutListingToMobileListing('https://www.immobilienscout24.de/expose/158382494')).toBe(
        'https://api.mobile.immobilienscout24.de/expose/158382494',
      );
    });

    it.each([null, undefined, ''])('should return null for %s', (url) => {
      expect(convertImmoscoutListingToMobileListing(url)).toBeNull();
    });
  });

  // Replays the whole catalogue of known paths against the real mobile API. A path ImmoScout
  // retired, or a parameter a type stopped accepting, shows up as a 412 here and nowhere else -
  // the offline fixtures cannot notice either. Skipped offline, where fetch is mocked.
  it.skipIf(process.env.TEST_MODE === 'offline')(
    'should be accepted by the mobile API for every known web path',
    { timeout: 180_000 },
    async () => {
      const rejected = [];
      for (const path of listKnownWebPaths()) {
        const url = convertWebToMobile(`${DUESSELDORF}/${path}`).replace('/search/list?', '/search/total?');

        const response = await fetch(url, { headers: { 'User-Agent': 'ImmoScout_28.1_26.5.2_._' } });
        const body = await response.json();
        if (!response.ok || body.error) {
          rejected.push(`${path}: ${response.status} ${JSON.stringify(body).slice(0, 160)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      expect(rejected).toEqual([]);
    },
  );

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
      expect(responseBody.resultListItems.length).toBeGreaterThan(0);
      expect(responseBody.resultListItems.filter((r) => r.type === 'EXPOSE_RESULT')[0].item.realEstateType).toBe(type);
    }
  });
});
