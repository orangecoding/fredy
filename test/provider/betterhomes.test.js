/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, expect } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import { get } from '../mocks/mockNotification.js';
import * as provider from '../../lib/provider/betterhomes.js';

/** Run-scoped provider config, built per test via createConfig(). */
let runConfig;

// BETTERHOMES is read through the JSON endpoint its own search page calls, so there is no browser
// in play and the whole suite is a handful of requests.
const TEST_TIMEOUT = 120_000;

/** One row in the shape `Object/search` answers with. */
const row = (overrides = {}) => ({
  uniqueKey: '11111111-2222-3333-4444-555555555555',
  objectId: '11111111-2222-3333-4444-555555555555',
  title: 'HELLE WOHNUNG MIT BALKON',
  priceGross: '420.000 &euro;',
  priceGrossFloat: '420000.00',
  be_obj_preisnachvereinbarung: '0',
  livingSpace: '82',
  usableArea: '0',
  rooms: '3.5',
  zipcode: '10115',
  city: 'Berlin-Mitte',
  images: [{ imageUrl: 'https://www2.betterhomes.de/img_obj_de/abc/web/1.jpg', imageType: 1 }],
  ...overrides,
});

describe('#betterhomes provider testsuite()', () => {
  runConfig = provider.createConfig(providerConfig.betterhomes, [], []);

  let liveListings;

  it(
    'should test betterhomes provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = {
        id: 'betterhomes',
        notificationAdapter: null,
        spatialFilter: null,
        specFilter: null,
      };

      const fredy = new Fredy(runConfig, mockedJob, provider.metaInformation.id, similarityCache, undefined);

      liveListings = await fredy.execute();

      if (liveListings == null || liveListings.length === 0) {
        throw new Error('Listings is empty!');
      }

      expect(liveListings).toBeInstanceOf(Array);
      const notificationObj = get();
      expect(notificationObj).toBeTypeOf('object');
      expect(notificationObj.serviceName).toBe('betterhomes');

      const hasValidNotification = notificationObj.payload.some((notify) => {
        return (
          typeof notify.id === 'string' &&
          typeof notify.title === 'string' &&
          notify.title !== '' &&
          typeof notify.link === 'string' &&
          notify.link.includes('/immobilie-suchen/detail/objectId/') &&
          typeof notify.address === 'string' &&
          notify.address !== ''
        );
      });

      expect(hasValidNotification).toBe(true);
    },
    TEST_TIMEOUT,
  );

  /**
   * The payload *is* the pasted url's query string, which is what lets a filter Fredy has never
   * heard of still reach the portal. A regression here does not fail loudly: the search simply runs
   * wider than the user set it.
   */
  describe('a url that is not a BETTERHOMES search', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    // Without its scheme (or on another host) nothing about it can be read, and the fallback was
    // an unfiltered search of every German advert.
    it('searches nothing rather than everything', async () => {
      let called = false;
      globalThis.fetch = async () => {
        called = true;
        throw new Error('should not be called');
      };

      const rows = await provider.config.getListings('www.betterhomes.ch/de/immobilie-suchen/mieten?priceMax=1500');

      expect(rows).toEqual([]);
      expect(called).toBe(false);
    });
  });

  describe('buildSearchPayload', () => {
    it('carries every search parameter over as it stands', () => {
      const payload = provider.buildSearchPayload(
        'https://www.betterhomes.de/de/immobilie-suchen/mieten?searchType=rent&objectType=apartment&priceMax=1500&roomsMin=2',
      );

      expect(payload).toMatchObject({
        searchType: 'rent',
        objectType: 'apartment',
        priceMax: '1500',
        roomsMin: '2',
      });
    });

    it('drops the bounds the form left empty', () => {
      // `?priceMin=&priceMax=1500` is what an untouched lower bound looks like, and the endpoint
      // reads the empty one as a bound of zero rather than as no bound.
      const payload = provider.buildSearchPayload(
        'https://www.betterhomes.de/de/immobilie-suchen/mieten?priceMin=&priceMax=1500',
      );

      expect(payload.priceMin).toBeUndefined();
      expect(payload.priceMax).toBe('1500');
    });

    it('asks each site about its own country', () => {
      expect(provider.buildSearchPayload('https://www.betterhomes.de/de/immobilie-suchen/kaufen').countryCode).toBe(
        'DE',
      );
      expect(provider.buildSearchPayload('https://www.betterhomes.at/de/immobilie-suchen/kaufen').countryCode).toBe(
        'AT',
      );
      expect(provider.buildSearchPayload('https://www.betterhomes.ch/de/immobilie-suchen/kaufen').countryCode).toBe(
        'CH',
      );
    });

    it('takes the language from the url, which is where the sites carry it', () => {
      expect(provider.buildSearchPayload('https://www.betterhomes.ch/fr/rechercher/louer').languageCode).toBe('fr');
      expect(provider.buildSearchPayload('https://www.betterhomes.de/immobilie-suchen/kaufen').languageCode).toBe('de');
    });

    it('sorts by date when the url does not say', () => {
      expect(provider.buildSearchPayload('https://www.betterhomes.de/de/immobilie-suchen/kaufen').sortOrder).toBe(
        'newestDesc',
      );
    });
  });

  describe('normalize', () => {
    it('reads one search row into a listing', () => {
      const listing = runConfig.normalize(row());

      expect(listing.id).toBeTypeOf('string');
      expect(listing.title).toBe('HELLE WOHNUNG MIT BALKON');
      expect(listing.price).toBe(420000);
      expect(listing.size).toBe(82);
      expect(listing.rooms).toBe(3.5);
      expect(listing.address).toBe('10115 Berlin-Mitte');
      expect(listing.image).toBe('https://www2.betterhomes.de/img_obj_de/abc/web/1.jpg');
    });

    /**
     * `priceGrossFloat` is an English decimal - `420000.00`. Parsed with the German rule that a dot
     * groups thousands, the same advert would be stored at a hundred times its price.
     */
    it('does not read the decimal point as a thousands separator', () => {
      expect(runConfig.normalize(row({ priceGrossFloat: '1200.00' })).price).toBe(1200);
    });

    /**
     * A rent is the Nettomiete everywhere else in Fredy: the affordability check adds the
     * Nebenkosten itself, so the Bruttomiete beside it would count them twice.
     */
    it('prices a rental at its Nettomiete, as the German and Swiss rows state it', () => {
      const listing = runConfig.normalize(
        row({ rental: 'M', priceNet: '850', priceGross: '1.150 &euro;', priceGrossFloat: '1150.00' }),
      );

      expect(listing.price).toBe(850);
    });

    it('reads the Nettomiete the Austrian rows write as display text', () => {
      expect(runConfig.normalize(row({ rental: 'M', priceNet: '€   1.600,-', priceGrossFloat: '1760.00' })).price).toBe(
        1600,
      );
      expect(runConfig.normalize(row({ rental: 'M', priceNet: '€   684,55', priceGrossFloat: '980.00' })).price).toBe(
        684.55,
      );
    });

    it('falls back to the Bruttomiete when a rental states no Nettomiete', () => {
      expect(runConfig.normalize(row({ rental: 'M', priceNet: null, priceGrossFloat: '1200.00' })).price).toBe(1200);
    });

    it('keeps the price of a sale as it is', () => {
      expect(runConfig.normalize(row({ rental: 'K', priceNet: null, priceGrossFloat: '420000.00' })).price).toBe(
        420000,
      );
    });

    it('leaves a withheld price empty rather than free', () => {
      // "Miete auf Anfrage" - the portal spells that `0.00` and flags it beside the figure.
      const listing = runConfig.normalize(
        row({ priceGross: 'Miete auf Anfrage', priceGrossFloat: '0.00', be_obj_preisnachvereinbarung: '1' }),
      );

      expect(listing.price).toBeNull();
    });

    /**
     * Every area and room count arrives as the string `"0"` when the portal does not state it. Read
     * literally, a commercial unit with no living space stated is a flat of nought square metres,
     * which any minimum-size filter then throws away.
     */
    it('reads an unstated area as unknown, not as zero', () => {
      const listing = runConfig.normalize(row({ livingSpace: '0', usableArea: '0', rooms: null }));

      expect(listing.size).toBeNull();
      expect(listing.rooms).toBeNull();
    });

    it('falls back to the usable area for a unit with no living space', () => {
      expect(runConfig.normalize(row({ livingSpace: '0', usableArea: '140' })).size).toBe(140);
    });

    it('links to the site the search was on, beside the page it came from', () => {
      const swiss = provider.createConfig(
        { url: 'https://www.betterhomes.ch/de/immobilie-suchen/mieten?searchType=rent', enabled: true },
        [],
      );

      expect(swiss.normalize(row()).link).toBe(
        'https://www.betterhomes.ch/de/immobilie-suchen/detail/objectId/11111111-2222-3333-4444-555555555555',
      );
      expect(runConfig.normalize(row()).link).toContain('https://www.betterhomes.de/de/immobilie-suchen/detail/');
    });

    // A re-listed advert keeps its object id, so a hash over the id alone would make the pipeline
    // treat the cheaper re-listing as a listing it has already seen.
    it('changes the hash when the price changes', () => {
      expect(runConfig.normalize(row()).id).not.toBe(runConfig.normalize(row({ priceGrossFloat: '399000.00' })).id);
    });
  });

  describe('metaInformation', () => {
    it('accepts a search on any of the three sites', () => {
      expect(provider.metaInformation.hosts).toEqual(
        expect.arrayContaining(['betterhomes.de', 'betterhomes.at', 'betterhomes.ch']),
      );
    });

    // Which country to geocode one advert in. The search url says nothing useful here: it belongs
    // to the job, and a job's url can be pointed at another country after the listing was stored.
    it('narrows a stored listing to the country its own link names', () => {
      const countryOf = provider.metaInformation.countryOf;

      expect(countryOf({ link: 'https://www.betterhomes.at/de/immobilie-suchen/detail/objectId/x' })).toBe('at');
      expect(countryOf({ link: 'https://www.betterhomes.ch/de/immobilie-suchen/detail/objectId/x' })).toBe('ch');
      expect(countryOf({ link: 'https://example.com/whatever' })).toBeNull();
      expect(countryOf(null)).toBeNull();
    });
  });

  describe('fetchDetails', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it(
      'enriches a listing against the live endpoint',
      async () => {
        if (!liveListings?.length) throw new Error('No listings from first test to enrich');

        const enriched = await runConfig.fetchDetails(liveListings[0]);

        expect(enriched).toBeTruthy();
        expect(enriched.link).toBe(liveListings[0].link);
        expect(enriched.address).toBeTypeOf('string');
        expect(enriched.address).not.toBe('');
      },
      TEST_TIMEOUT,
    );

    /**
     * The detail response is the only place a BETTERHOMES advert has prose at all, and the three
     * blocks it splits that prose across are all worth having: the blacklist is matched against
     * whatever ends up here.
     */
    it('reads the detail response into the fields the search response leaves empty', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          responseCode: 200,
          responseData: {
            id: '11111111-2222-3333-4444-555555555555',
            address: { city: '10115 Berlin-Mitte', street: '', cityLatitude: '52.5321', cityLongitude: '13.3849' },
            descriptionText: 'Helle Wohnung im Hinterhaus.',
            advantage: '- Balkon\n- Aufzug',
            location: 'Ruhige Seitenstraße.',
            constructionYear: '1998',
            energyPass: { efficiencyClass: 'C' },
          },
        }),
      });

      const enriched = await runConfig.fetchDetails({
        id: 'x',
        link: 'https://www.betterhomes.de/de/immobilie-suchen/detail/objectId/11111111-2222-3333-4444-555555555555',
        description: '',
      });

      expect(enriched.description).toBe('Helle Wohnung im Hinterhaus.\n\n- Balkon\n- Aufzug\n\nRuhige Seitenstraße.');
      expect(enriched.address).toBe('10115 Berlin-Mitte');
      // The detail's coordinates are the town centre. With an address to geocode they are left out,
      // so the pipeline locates the postcode instead of putting every Berlin advert in Mitte.
      expect(enriched.latitude).toBeUndefined();
      expect(enriched.longitude).toBeUndefined();
      expect(enriched.buildYear).toBe(1998);
      expect(enriched.energyClass).toBe('C');
    });

    // The town centre is only worth having for a listing with no address to geocode at all. And it
    // is a machine decimal: read as "thousands" the way `extractNumber` reads a dot before three
    // digits, "47.377" became 47377 and the listing fell off the planet.
    it('uses the town centre, read as a coordinate, when there is no address to geocode', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          responseCode: 200,
          responseData: {
            id: '11111111-2222-3333-4444-555555555555',
            address: { city: '', street: '', cityLatitude: '47.377', cityLongitude: '8.540' },
          },
        }),
      });

      const enriched = await runConfig.fetchDetails({
        id: 'x',
        link: 'https://www.betterhomes.ch/de/immobilie-suchen/detail/objectId/11111111-2222-3333-4444-555555555555',
        description: '',
        address: null,
      });

      expect(enriched.latitude).toBe(47.377);
      expect(enriched.longitude).toBe(8.54);
    });

    it('hands the listing back untouched when the link carries no object id', async () => {
      const listing = { id: 'x', link: 'https://www.betterhomes.de/de/immobilie-suchen/kaufen', description: '' };

      await expect(runConfig.fetchDetails(listing)).resolves.toBe(listing);
    });

    // A listing that could not be enriched is still a listing worth notifying about, so a refusal
    // must not take the whole run down with it.
    it('keeps the listing when the endpoint refuses', async () => {
      globalThis.fetch = async () => ({ ok: false, status: 503, statusText: 'Service Unavailable' });

      const listing = {
        id: 'x',
        link: 'https://www.betterhomes.de/de/immobilie-suchen/detail/objectId/11111111-2222-3333-4444-555555555555',
        description: '',
        title: 'Wohnung',
      };

      await expect(runConfig.fetchDetails(listing)).resolves.toBe(listing);
    });
  });

  describe('activityProbe and the price probe', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    const link = 'https://www.betterhomes.de/de/immobilie-suchen/detail/objectId/11111111-2222-3333-4444-555555555555';

    it('reports an advert the endpoint still knows as active', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ responseCode: 200, responseData: { id: 'x', priceGrossFloat: '420000.00' } }),
      });

      await expect(provider.config.activityProbe(link)).resolves.toBe(1);
    });

    it('reports a withdrawn advert as gone', async () => {
      // The rendered page answers 200 for any id at all; only the endpoint says the advert is gone.
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ responseCode: 1000, responseData: null }),
      });

      await expect(provider.config.activityProbe(link)).resolves.toBe(0);
    });

    /**
     * The one answer that must never read as "withdrawn": a refused request says nothing about the
     * advert, and answering 0 would soft-delete every BETTERHOMES listing the first time the
     * endpoint rate-limits a sweep.
     */
    it('reports a refused request as unknown rather than as gone', async () => {
      globalThis.fetch = async () => ({ ok: false, status: 429, statusText: 'Too Many Requests' });

      await expect(provider.config.activityProbe(link)).resolves.toBe(-1);
    });

    // An answer without a payload that is not the endpoint's own "no such object" - an error
    // envelope, a maintenance page as JSON - says nothing about the advert either.
    it('reports an error envelope as unknown rather than as gone', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ responseCode: 500, responseData: null }),
      });

      await expect(provider.config.activityProbe(link)).resolves.toBe(-1);
    });

    it('reports no price for an advert whose detail says the price is on request', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          responseCode: 200,
          responseData: { id: 'x', priceGrossFloat: '420000.00', priceOnApplication: true },
        }),
      });

      await expect(provider.config.priceTracking.probe({ link })).resolves.toBeNull();
    });

    it('reports a link on no BETTERHOMES site as unknown, without asking anyone', async () => {
      let called = false;
      globalThis.fetch = async () => {
        called = true;
        throw new Error('should not be called');
      };

      await expect(provider.config.activityProbe('https://example.com/listing/1')).resolves.toBe(-1);
      expect(called).toBe(false);
    });

    /**
     * The probe has to read the figure the search list stored, or every listing reports a price
     * change at once. For a rental that is the Nettomiete, which the detail payload only has as
     * display text - in each site's own spelling.
     */
    it.each([
      ['1.500 &euro;', 1500],
      ['€   1.600,-', 1600],
      ["CHF 1'795.-", 1795],
      ['€   684,55', 684.55],
    ])('tracks the Nettomiete of a rental, written as %s', async (priceNet, expected) => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          responseCode: 200,
          responseData: {
            id: '11111111-2222-3333-4444-555555555555',
            rental: true,
            priceGross: '1.800 &euro;',
            priceGrossFloat: '1800.00',
            priceNet,
            priceOnApplication: 'null',
          },
        }),
      });

      await expect(provider.config.priceTracking.probe({ link })).resolves.toBe(expected);
    });

    it('tracks the price of a sale', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          responseCode: 200,
          responseData: {
            id: '11111111-2222-3333-4444-555555555555',
            rental: false,
            priceGross: '420.000 &euro;',
            priceGrossFloat: '420000.00',
            priceNet: null,
            priceOnApplication: false,
          },
        }),
      });

      await expect(provider.config.priceTracking.probe({ link })).resolves.toBe(420000);
    });

    it('returns null rather than zero for an advert it cannot read', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ responseCode: 1000, responseData: null }),
      });

      await expect(provider.config.priceTracking.probe({ link })).resolves.toBeNull();
    });
  });
});
