/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { getProviders } from '../../../lib/utils.js';
import { priceBound, priceRangeFromUrl, resolveJobPriceRange } from '../../../lib/services/tracking/priceRange.js';

const providers = await getProviders();

/** The static template of one provider, by id. */
const configOf = (id) => providers.find((provider) => provider.metaInformation.id === id)?.config;

/**
 * Real search URLs, each recorded off the portal itself with a 500-1000 € filter set (sparkasse
 * sells rather than rents, so its figures are a purchase band).
 *
 * These are the whole point of the table: a parameter name is only worth what the URL it came from
 * says, and a portal that renames one should fail here rather than quietly report no band.
 */
const RECORDED_SEARCHES = [
  [
    'deutscheWohnen',
    'https://www.deutsche-wohnen.com/mieten/mietangebote?rentType=miete&city=Berlin&immoType=wohnung&priceMin=500&priceMax=1000&minRooms=Beliebig&balcony=egal',
    { min: 500, max: 1000 },
  ],
  [
    'engelVoelkers',
    'https://www.engelvoelkers.com/de/de/propertysearch?businessArea[]=residential&currency=EUR&page=1&placeName=Berlin%2C%20Deutschland&price.max=1000&price.min=500&propertyMarketingType[]=sale',
    { min: 500, max: 1000 },
  ],
  [
    'flatfox',
    'https://flatfox.ch/de/search/?east=8.620000&max_price=1000&min_price=500&north=47.451922&object_category=APARTMENT&offer_type=RENT&south=47.298023&take=48&west=8.440000',
    { min: 500, max: 1000 },
  ],
  // idealista is three national sites in one provider, and each of them spells its bounds
  // differently - Italy's upper bound is the bare `prezzo`, one dash away from its own lower one.
  // All three are listed because a URL is understood by its path, not by the domain it came from.
  [
    'idealista',
    'https://www.idealista.com/alquiler-viviendas/madrid-madrid/con-precio-desde_500,precio-hasta_1000/',
    { min: 500, max: 1000 },
  ],
  [
    'idealista',
    'https://www.idealista.it/affitto-case/milano-milano/con-prezzo_1000,prezzo-min_500/',
    { min: 500, max: 1000 },
  ],
  [
    'idealista',
    'https://www.idealista.pt/arrendar-casas/lisboa/com-preco-min_500,preco-max_1000/',
    { min: 500, max: 1000 },
  ],
  [
    'subito',
    'https://www.subito.it/annunci-lombardia/affitto/appartamenti/milano/?ps=500&pe=1000',
    { min: 500, max: 1000 },
  ],
  [
    'immobilienDe',
    'https://www.immobilien.de/suche?kategorie=wohnen&typ=mieten&objektart=wohnung&ort=D%C3%BCsseldorf&umkreis=15&flaeche_von=50&preis_bis=1000&art=wohnung&preis_von=500',
    { min: 500, max: 1000 },
  ],
  [
    'immoswp',
    'https://immo.swp.de/suchergebnisse?l=M%C3%BCnchen&r=0km&t=apartment%3Arental%3Aliving&a=de.muenchen&pf=500&pt=1000&rf=&rt=&sf=50&st=&psf=&pst=&s=most_recently_updated_first',
    { min: 500, max: 1000 },
  ],
  [
    'immowelt',
    'https://www.immowelt.de/classified-search?distributionTypes=Buy,Buy_Auction&estateTypes=House,Apartment&locations=AD08DE2350&priceMax=1000&priceMin=500',
    { min: 500, max: 1000 },
  ],
  [
    'kleinanzeigen',
    'https://www.kleinanzeigen.de/s-immobilien/duesseldorf/anzeige:angebote/preis:500:1000/wohnung/k0c195l2068r5',
    { min: 500, max: 1000 },
  ],
  [
    'mcMakler',
    'https://www.mcmakler.de/immobilien/nordrhein-westfalen/duesseldorf?priceMin=500&priceMax=1000',
    { min: 500, max: 1000 },
  ],
  [
    'neubauKompass',
    'https://www.neubaukompass.de/neubau-immobilien/duesseldorf-region/wohnung-kaufen/?apartmenttype=eigentumswohnung&rooms=&pagenumber=1&priceMinimum=500&priceMaximum=1000&geo=50',
    { min: 500, max: 1000 },
  ],
  [
    'ohneMakler',
    'https://www.ohne-makler.net/immobilien/wohnung-kaufen/nordrhein-westfalen/dusseldorf/?price_max=1000&price_min=500',
    { min: 500, max: 1000 },
  ],
  [
    'schwarzesbrett',
    'https://schwarzesbrett.bremen.de/verkauf-und-angebote/mietobjekte?price_filters[min]=500&price_filters[max]=1000&sort=date_desc#results',
    { min: 500, max: 1000 },
  ],
  [
    'sparkasse',
    'https://immobilien.sparkasse.de/immobilien/treffer?estateTypeGroupingId=403&marketingType=buy&maxPrice=500000&minPrice=100000&perimeter=10&usageType=residential&zipCityEstateId=51.22422%2F6.78006%2F0__D%C3%BCsseldorf',
    { min: 100000, max: 500000 },
  ],
  [
    'tecnocasa',
    'https://www.tecnocasa.it/affitto/immobili/lombardia/milano/milano.html?min_price=500&max_price=1000',
    { min: 500, max: 1000 },
  ],
  [
    'tecnorete',
    'https://www.tecnorete.it/affitto/immobili/lombardia/brescia/brescia.html?min_price=500&max_price=1000',
    { min: 500, max: 1000 },
  ],
];

/**
 * The portals whose price filter never reaches the URL. Their searches were recorded the same way -
 * with a filter set - and came back unchanged, which is what `null` here records.
 */
const NO_RANGE_IN_URL = [
  [
    'einsAImmobilien',
    'https://www.1a-immobilienmarkt.de/suchen/duesseldorf/wohnung-kaufen.html?search=yes&data_hash=63e29698adbf93dc7dac3c1204b86e03&sort_type=newest',
  ],
  [
    'imaxx',
    'https://www.imaxx.de/immobilien/?post_type=immomakler_object&radius=1&vermarktungsart%5B0%5D=kauf&typ%5B0%5D=wohnung',
  ],
  ['inberlinwohnen', 'https://inberlinwohnen.de/wohnungsfinder/'],
  ['regionalimmobilien24', 'https://www.regionalimmobilien24.de/rostock/rostock/kaufen/haus/-/-/-/?rd=5'],
  ['wgGesucht', 'https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf.30.0.1.0.html'],
  ['willhaben', 'https://www.willhaben.at/iad/immobilien/mietwohnungen/wien'],
];

const IMMOSCOUT = 'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf';

describe('services/tracking/priceRange', () => {
  describe('reading the range off a real search URL', () => {
    it.each(RECORDED_SEARCHES)('reads %s', (id, url, expected) => {
      expect(priceRangeFromUrl(url, configOf(id).priceRangeParams)).toEqual(expected);
    });

    it.each(NO_RANGE_IN_URL)('finds nothing for %s, which keeps its filter off the URL', (id, url) => {
      expect(priceRangeFromUrl(url, configOf(id).priceRangeParams)).toEqual({ min: null, max: null });
    });

    it('every shipped provider has been looked at', () => {
      const declared = new Set([...RECORDED_SEARCHES, ...NO_RANGE_IN_URL].map(([id]) => id));
      declared.add('immoscout');
      expect(providers.map((provider) => provider.metaInformation.id).filter((id) => !declared.has(id))).toEqual([]);
    });
  });

  describe('immoscout, which packs both bounds into one parameter', () => {
    const rangeOf = (url) => priceRangeFromUrl(url, configOf('immoscout').priceRangeParams);

    it('reads both bounds', () => {
      expect(rangeOf(`${IMMOSCOUT}/wohnung-mieten?price=500.0-1000.0`)).toEqual({ min: 500, max: 1000 });
    });

    it('treats a leading dash as an open lower bound, not a negative price', () => {
      expect(rangeOf(`${IMMOSCOUT}/haus-kaufen?price=-600000.0`)).toEqual({ min: null, max: 600000 });
    });

    it('reads a trailing dash as an open upper bound', () => {
      expect(rangeOf(`${IMMOSCOUT}/haus-kaufen?price=250000.0-`)).toEqual({ min: 250000, max: null });
    });

    it('understands the scientific notation the slider emits at full range', () => {
      expect(rangeOf(`${IMMOSCOUT}/haus-kaufen?price=1.0-1.0E7`)).toEqual({ min: 1, max: 10000000 });
    });

    it('finds the bound the SEO path hides, where there is no price parameter at all', () => {
      expect(rangeOf(`${IMMOSCOUT}/wohnung-bis-800-euro-warm`)).toEqual({ min: null, max: 800 });
    });

    it('finds nothing in an unfiltered search', () => {
      expect(rangeOf(`${IMMOSCOUT}/wohnung-mieten?enteredFrom=one_step_search`)).toEqual({ min: null, max: null });
    });

    it('answers no range for a URL the translator refuses rather than throwing', () => {
      expect(rangeOf('https://www.immobilienscout24.de/nonsense')).toEqual({ min: null, max: null });
    });
  });

  describe('immobilienDe, whose search URL was renamed under its users', () => {
    it('still reads a legacy URL saved before the site moved', () => {
      const legacy =
        'https://www.immobilien.de/Wohnen/Suchergebnisse-Wohnung-mieten.html?search.typ=mieten&search.preis_von=500&search.preis_bis=1000';
      expect(priceRangeFromUrl(legacy, configOf('immobilienDe').priceRangeParams)).toEqual({ min: 500, max: 1000 });
    });
  });

  describe('priceBound', () => {
    it.each([
      ['a number', 500, 500],
      ['a numeric string', '1000', 1000],
      ['a decimal', '999.5', 999.5],
      ['an empty parameter', '', null],
      ['a missing parameter', null, null],
      ['undefined', undefined, null],
      ['zero, which a cleared field leaves behind', 0, null],
      ['a negative', -1, null],
      ['nonsense', 'Beliebig', null],
      ['infinity', Infinity, null],
    ])('turns %s into the right bound', (_label, value, expected) => {
      expect(priceBound(value)).toBe(expected);
    });
  });

  describe('resolving one job', () => {
    const provider = (id, priceRangeParams) => ({ metaInformation: { id }, config: { priceRangeParams } });
    const PAIR = { min: 'priceMin', max: 'priceMax' };
    const withRange = provider('a', PAIR);
    const otherWithRange = provider('b', PAIR);
    const withoutRange = provider('c', null);

    const url = (min, max) => {
      const params = new URLSearchParams();
      if (min != null) params.set('priceMin', String(min));
      if (max != null) params.set('priceMax', String(max));
      return `https://example.org/search?${params}`;
    };

    it('takes both bounds from the URL', () => {
      const job = { provider: [{ id: 'a', url: url(500, 1000) }], specFilter: null };
      expect(resolveJobPriceRange(job, [withRange])).toEqual({ min: 500, max: 1000 });
    });

    it('completes a URL that only has a lower bound from the Fredy filter', () => {
      const job = { provider: [{ id: 'a', url: url(500, null) }], specFilter: { maxPrice: 1200 } };
      expect(resolveJobPriceRange(job, [withRange])).toEqual({ min: 500, max: 1200 });
    });

    it('completes a URL that only has an upper bound from the Fredy filter', () => {
      const job = { provider: [{ id: 'a', url: url(null, 1000) }], specFilter: { minPrice: 400 } };
      expect(resolveJobPriceRange(job, [withRange])).toEqual({ min: 400, max: 1000 });
    });

    it('leaves the half the URL opened open when Fredy has nothing to add', () => {
      const job = { provider: [{ id: 'a', url: url(500, null) }], specFilter: null };
      expect(resolveJobPriceRange(job, [withRange])).toEqual({ min: 500, max: null });
    });

    it('falls back to the Fredy filter for a provider that keeps price out of its URL', () => {
      const job = { provider: [{ id: 'c', url: 'https://example.org/search' }], specFilter: { maxPrice: 1200 } };
      expect(resolveJobPriceRange(job, [withoutRange])).toEqual({ min: null, max: 1200 });
    });

    it('reports no range when nothing is set anywhere', () => {
      const job = { provider: [{ id: 'c', url: 'https://example.org/search' }], specFilter: null };
      expect(resolveJobPriceRange(job, [withoutRange])).toEqual({ min: null, max: null });
    });

    it('lets the URL win over the Fredy filter when both say something', () => {
      const job = { provider: [{ id: 'a', url: url(500, 1000) }], specFilter: { minPrice: 1, maxPrice: 99999 } };
      expect(resolveJobPriceRange(job, [withRange])).toEqual({ min: 500, max: 1000 });
    });

    it('uses the one range on offer when the other portals have no opinion', () => {
      const job = {
        provider: [
          { id: 'a', url: url(500, 1000) },
          { id: 'c', url: 'https://example.org/search' },
        ],
        specFilter: null,
      };
      expect(resolveJobPriceRange(job, [withRange, withoutRange])).toEqual({ min: 500, max: 1000 });
    });

    it('agrees with itself across portals that were configured the same way', () => {
      const job = {
        provider: [
          { id: 'a', url: url(500, 1000) },
          { id: 'b', url: url(500, 1000) },
        ],
        specFilter: null,
      };
      expect(resolveJobPriceRange(job, [withRange, otherWithRange])).toEqual({ min: 500, max: 1000 });
    });

    it('drops only the bound two portals disagree on, and keeps the one they share', () => {
      const job = {
        provider: [
          { id: 'a', url: url(500, 1000) },
          { id: 'b', url: url(500, 2000) },
        ],
        specFilter: null,
      };
      expect(resolveJobPriceRange(job, [withRange, otherWithRange])).toEqual({ min: 500, max: null });
    });

    it('lets the Fredy filter answer a bound the portals could not agree on', () => {
      const job = {
        provider: [
          { id: 'a', url: url(500, 1000) },
          { id: 'b', url: url(500, 2000) },
        ],
        specFilter: { maxPrice: 1500 },
      };
      expect(resolveJobPriceRange(job, [withRange, otherWithRange])).toEqual({ min: 500, max: 1500 });
    });

    it('survives a provider the job names but that is no longer installed', () => {
      const job = { provider: [{ id: 'gone', url: url(500, 1000) }], specFilter: { maxPrice: 1200 } };
      expect(resolveJobPriceRange(job, [withRange])).toEqual({ min: null, max: 1200 });
    });

    it('survives a job with no providers and no filter at all', () => {
      expect(resolveJobPriceRange({}, [])).toEqual({ min: null, max: null });
    });

    it('survives an unparsable URL', () => {
      const job = { provider: [{ id: 'a', url: 'not a url' }], specFilter: { maxPrice: 1200 } };
      expect(resolveJobPriceRange(job, [withRange])).toEqual({ min: null, max: 1200 });
    });

    it('survives a provider parser that throws', () => {
      const exploding = provider('boom', {
        parse: () => {
          throw new Error('unexpected path shape');
        },
      });
      const job = { provider: [{ id: 'boom', url: 'https://example.org/x' }], specFilter: { maxPrice: 1200 } };
      expect(resolveJobPriceRange(job, [exploding])).toEqual({ min: null, max: 1200 });
    });
  });
});
