/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  call,
  forgetToken,
  formEncode,
  REQUEST_GAP_MS,
  resetPacing,
  sign,
} from '../../lib/services/idealista/mobile-api.js';
import { resetSearchMemory, searchListings } from '../../lib/services/idealista/search.js';
import { readCategory, readFilters } from '../../lib/services/idealista/search-filters.js';
import { translateSearchUrl } from '../../lib/services/idealista/web-translator.js';
import { PORTALS, portalOf } from '../../lib/services/idealista/portal.js';
import { slugify } from '../../lib/utils/slugify.js';
import {
  decodePolyline,
  outlineOf,
  parseOutline,
  resetZoneMemory,
  sharedLocationId,
  simplifyRing,
} from '../../lib/services/idealista/zones.js';

/** The three sites, as the modules below want them. */
const IT = PORTALS['idealista.it'];
const ES = PORTALS['idealista.com'];
const PT = PORTALS['idealista.pt'];

// The device id is an installation's property and lives in the settings table; in these tests it
// is simply a constant, so no database is ever opened.
vi.mock('../../lib/services/idealista/device-id.js', () => ({
  idealistaDeviceId: async () => '0123456789abcdef',
}));

/**
 * The idealista provider asks the app's api for a search that a user described by pasting a website
 * url. What these tests pin is that translation, because it is where a portal change lands and
 * because nothing else in the pipeline can tell a search that was carried over faithfully from one
 * that quietly widened.
 *
 * `reverse-engineered-idealista.md` records where each of these facts was measured.
 */
describe('the signature idealista wants on every request', () => {
  /**
   * The api rebuilds the signed message from the parameters it received, encoding them as
   * `java.net.URLEncoder` does. `encodeURIComponent` differs from it in exactly these places, and a
   * signature computed over the difference is rejected with a 401 that names nothing.
   */
  it('encodes a parameter the way java does, not the way javascript does', () => {
    expect(formEncode('due locali')).toBe('due+locali');
    expect(formEncode("a!b'c(d)e~f")).toBe('a%21b%27c%28d%29e%7Ef');
    // Left alone by both, and so a silent difference if either list were changed.
    expect(formEncode('a*b-c_d.e')).toBe('a*b-c_d.e');
    expect(formEncode('[0-EU-IT-MI]')).toBe('%5B0-EU-IT-MI%5D');
  });

  it('signs with a fresh seed, so two identical requests do not carry one signature', () => {
    const query = /** @type {Array<[string, unknown]>} */ ([['k', 'key']]);
    const first = sign('POST', query, []);
    const second = sign('POST', query, []);

    expect(first.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(first.seed).not.toBe(second.seed);
    expect(first.signature).not.toBe(second.signature);
  });
});

describe('which of the three sites a url belongs to', () => {
  /**
   * The provider is one module for three national sites, and everything that differs between them -
   * which api answers, which country code the paths carry, which site a relative link resolves
   * against - hangs off this one reading of the hostname.
   */
  it('reads the site off the hostname, with or without the www', () => {
    expect(portalOf('https://www.idealista.com/alquiler-viviendas/madrid-madrid/')?.country).toBe('es');
    expect(portalOf('https://www.idealista.it/affitto-case/roma-roma/')?.country).toBe('it');
    expect(portalOf('https://idealista.pt/arrendar-casas/lisboa/')?.country).toBe('pt');
  });

  it('sends each country to its own api, and nowhere else', () => {
    expect(ES.apiHost).toBe('https://app.idealista.com');
    expect(IT.apiHost).toBe('https://app.idealista.it');
    expect(PT.apiHost).toBe('https://app.idealista.pt');
  });

  /**
   * A url on a host idealista does not serve is refused rather than read as one of the three. Read
   * as Spain - which is what the upstream provider did - the run would search the Spanish
   * catalogue for a place named by a url from somewhere else and store whatever it found under
   * links to a site the user never asked about.
   */
  it('refuses a host that is not one of the three', () => {
    expect(portalOf('https://www.idealista.de/vendita-case/roma/')).toBeNull();
    expect(portalOf('https://www.example.com/')).toBeNull();
    expect(portalOf('not a url')).toBeNull();
    expect(portalOf(undefined)).toBeNull();
  });
});

describe('the search a website url describes', () => {
  it('reads the category out of the first segment', () => {
    expect(readCategory(IT, 'vendita-case')).toEqual({ operation: 'sale', propertyType: 'homes' });
    expect(readCategory(IT, 'affitto-stanze')).toEqual({ operation: 'rent', propertyType: 'bedrooms' });
    // The api sells no land, so this search has to be read off the website.
    expect(readCategory(IT, 'vendita-terreni')).toBeNull();
  });

  it('takes the place out of the path and ignores what the query string says', () => {
    const search = translateSearchUrl(
      IT,
      'https://www.idealista.it/affitto-case/milano-milano/centro-storico/?ordine=x',
    );

    expect(search).toMatchObject({
      operation: 'rent',
      propertyType: 'homes',
      locationSlugs: ['milano-milano', 'centro-storico'],
      locationCodes: [],
    });
  });

  it('reads a url the portal serves in another language, and one naming a page', () => {
    const expected = { operation: 'rent', propertyType: 'homes', locationSlugs: ['roma-roma'] };

    expect(translateSearchUrl(IT, 'https://www.idealista.it/en/affitto-case/roma-roma/')).toMatchObject(expected);
    expect(translateSearchUrl(IT, 'https://www.idealista.it/affitto-case/roma-roma/lista-3.htm')).toMatchObject(
      expected,
    );
  });

  it('reports the codes of a multi-area search rather than trying to name them', () => {
    const search = translateSearchUrl(IT, 'https://www.idealista.it/multi/vendita-case/a5W,a7j,dJY/');

    expect(search?.locationCodes).toEqual(['a5W', 'a7j', 'dJY']);
    expect(search?.locationSlugs).toEqual([]);
  });

  /**
   * A search drawn on the map names no place: the polygon travels in the query string, as the
   * encoded polyline rings the tile host also serves borders in.
   */
  it('reads a drawn search, whose polygon sits in the query string', () => {
    const drawn =
      'https://www.idealista.it/aree/vendita-case/con-prezzo_300000,aste_no/?shape=%28%28qwnuGijvz%40%7DpH%29%29';

    expect(translateSearchUrl(IT, drawn)).toMatchObject({
      operation: 'sale',
      propertyType: 'homes',
      locationSlugs: [],
      locationCodes: [],
      drawnShape: '((qwnuGijvz@}pH))',
      variants: [
        [
          ['maxPrice', '300000'],
          ['auction', 'excludeAuctions'],
        ],
      ],
    });

    // A drawn search pages without the `.htm` the other searches carry.
    const paged = 'https://www.idealista.it/aree/vendita-case/lista-3?shape=%28%28qwnuGijvz%40%7DpH%29%29';
    expect(translateSearchUrl(IT, paged)?.drawnShape).toBe('((qwnuGijvz@}pH))');
  });

  /**
   * The search that motivated the drawn translation, kept whole: a price ceiling, the energy
   * boxes, no auctions, the "Appartamenti" box and the four house shapes, over two building
   * conditions - two searches whose answers merge, since the flats' box is `flat=1` and the houses'
   * shapes ride beside it in the same request.
   */
  it('carries a drawn search over whole', () => {
    const search = translateSearchUrl(
      IT,
      'https://www.idealista.it/aree/vendita-case/con-prezzo_300000,appartamenti,case-indipendenti,' +
        'villette-bifamiliari,villette-a-schiera,ville-indipendenti,trilocali-3,quadrilocali-4,' +
        '5-locali-o-piu,nuova-costruzione,buono-stato,aste_no,alta-efficienza,media-efficienza/' +
        '?shape=%28%28qwnuGijvz%40%7DpHyrB%29%29',
    );

    expect(search?.drawnShape).toBe('((qwnuGijvz@}pHyrB))');
    expect(search?.variants).toHaveLength(2);
    for (const variant of search?.variants ?? []) {
      expect(variant).toContainEqual(['maxPrice', '300000']);
      expect(variant).toContainEqual(['bedrooms', '3,4,5']);
      expect(variant).toContainEqual(['auction', 'excludeAuctions']);
      expect(variant).toContainEqual(['energyEfficiency', 'high,medium']);
      expect(variant).toContainEqual(['flat', '1']);
      expect(variant).toContainEqual(['subTypology', 'independantHouse,semidetachedHouse,terracedHouse,villa']);
    }
  });

  /**
   * A url the api cannot be asked for in full is answered with nothing at all, so that the caller
   * reads the website. Answering with the part that did translate would run a wider search than the
   * user asked for and tell them about adverts they filtered out.
   */
  it('gives up on a search it cannot carry over whole', () => {
    // A filter with no counterpart: the box means terrace or balcony, two api parameters' worth.
    expect(
      translateSearchUrl(IT, 'https://www.idealista.it/affitto-case/roma-roma/con-terrazza-e-balcone/'),
    ).toBeNull();
    // A category the api does not serve.
    expect(translateSearchUrl(IT, 'https://www.idealista.it/vendita-terreni/roma-roma/')).toBeNull();
    // A drawn search that lost its polygon says nothing about where it looks.
    expect(translateSearchUrl(IT, 'https://www.idealista.it/aree/vendita-case/')).toBeNull();
    expect(translateSearchUrl(IT, 'not a url')).toBeNull();
  });
});

describe('the filters a website url hides in its path', () => {
  /**
   * The website's two names read against each other: the price is a ceiling where the size is a
   * floor. Reading either the wrong way round turns a search into its opposite and nothing
   * downstream would notice.
   */
  it('reads the price as a ceiling and the size as a floor', () => {
    expect(readFilters(IT, 'con-prezzo_450000')).toEqual([[['maxPrice', '450000']]]);
    expect(readFilters(IT, 'con-prezzo-min_180000')).toEqual([[['minPrice', '180000']]]);
    expect(readFilters(IT, 'con-dimensione_80')).toEqual([[['minSize', '80']]]);
    expect(readFilters(IT, 'con-dimensione-max_250')).toEqual([[['maxSize', '250']]]);
  });

  it('stacks the filters the website ticks box by box', () => {
    expect(readFilters(IT, 'con-trilocali-3,quadrilocali-4,5-locali-o-piu')).toEqual([[['bedrooms', '3,4,5']]]);
    expect(readFilters(IT, 'con-bagno-1,bagno-2')).toEqual([[['bathrooms', '1,2']]]);
  });

  /**
   * The website lets several building conditions be ticked and means their union; the api takes one
   * and answers a list with a 500. The search is therefore run once per condition.
   */
  it('splits a search naming several building conditions', () => {
    expect(readFilters(IT, 'con-nuova-costruzione,buono-stato')).toEqual([
      [['preservation', 'newdevelopment']],
      [['preservation', 'good']],
    ]);
  });

  /**
   * Asking for a shape of house is already asking for a house, and the api reads `chalet` alongside
   * `subTypology` as the wider of the two - every house rather than the four that were asked for.
   */
  it('lets the shape of a house speak for itself', () => {
    expect(readFilters(IT, 'con-villette-a-schiera,ville-indipendenti')).toEqual([
      [['subTypology', 'terracedHouse,villa']],
    ]);
  });

  /**
   * The energy boxes stack into one graded list, which unlike `preservation` the api reads as the
   * union it means.
   */
  it('reads the energy boxes as one list', () => {
    expect(readFilters(IT, 'con-alta-efficienza,media-efficienza')).toEqual([[['energyEfficiency', 'high,medium']]]);
    expect(readFilters(IT, 'con-aste_no')).toEqual([[['auction', 'excludeAuctions']]]);
  });

  /**
   * "Appartamenti" is one search: every penthouse and two-level flat it covers already answers a
   * `flat=1` request, measured by walking both and diffing the property codes. The houses' shapes
   * ride beside the flat in the same request, whose union is what the url asked for.
   */
  it('reads the "Appartamenti" box as one search beside the houses', () => {
    expect(readFilters(IT, 'con-appartamenti')).toEqual([[['flat', '1']]]);

    expect(readFilters(IT, 'con-appartamenti,ville-indipendenti')).toEqual([
      [
        ['flat', '1'],
        ['subTypology', 'villa'],
      ],
    ]);

    expect(readFilters(IT, 'con-appartamenti,nuova-costruzione,buono-stato')).toEqual([
      [
        ['flat', '1'],
        ['preservation', 'newdevelopment'],
      ],
      [
        ['flat', '1'],
        ['preservation', 'good'],
      ],
    ]);
  });

  it('has nothing to say about a url that carries no filters', () => {
    expect(readFilters(IT, '')).toEqual([[]]);
  });

  it('refuses a filter it has no counterpart for', () => {
    // The box means terrace or balcony, which the api reads as two searches' worth of conditions.
    expect(readFilters(IT, 'con-terrazza-e-balcone')).toBeNull();
    expect(readFilters(IT, 'con-ascensori,terrazza-e-balcone')).toBeNull();
  });

  /**
   * Three boxes that used to be untranslatable, mapped against a live api: the energy boxes all
   * three, the terrace spelled the way the app spells it, and the private garden the portal's own
   * parser named.
   */
  it('maps the boxes the api grew parameters for', () => {
    expect(readFilters(IT, 'con-bassa-efficienza')).toEqual([[['energyEfficiency', 'low']]]);
    expect(readFilters(IT, 'con-alta-efficienza,media-efficienza,bassa-efficienza')).toEqual([
      [['energyEfficiency', 'high,medium,low']],
    ]);
    expect(readFilters(IT, 'con-terrazza')).toEqual([[['terrance', '1']]]);
    expect(readFilters(IT, 'con-giardino-privato')).toEqual([[['privateGarden', '1']]]);
  });
});

/**
 * Spain and Portugal get the words a url cannot avoid - the category, the operation, the price and
 * the size - and nothing else, because their tick-box slugs were never read off a live page here
 * and a filter mapped by guesswork would widen a search silently. Everything beyond that is read by
 * idealista's own parser, and a url this table cannot carry over whole is read off the website.
 */
describe('the same url on the other two sites', () => {
  it('reads the Spanish and the Portuguese category', () => {
    expect(readCategory(ES, 'alquiler-viviendas')).toEqual({ operation: 'rent', propertyType: 'homes' });
    expect(readCategory(ES, 'venta-viviendas')).toEqual({ operation: 'sale', propertyType: 'homes' });
    expect(readCategory(PT, 'arrendar-casas')).toEqual({ operation: 'rent', propertyType: 'homes' });
    expect(readCategory(PT, 'comprar-casas')).toEqual({ operation: 'sale', propertyType: 'homes' });
  });

  // Each site speaks one language. An Italian word on a Spanish url is a url this cannot read.
  it('does not read the words of one country on the url of another', () => {
    expect(readCategory(ES, 'affitto-case')).toBeNull();
    expect(readCategory(IT, 'alquiler-viviendas')).toBeNull();
    expect(readCategory(PT, 'venta-viviendas')).toBeNull();
  });

  it('reads the price bounds each of them spells differently', () => {
    expect(readFilters(ES, 'con-precio-desde_800,precio-hasta_1200')).toEqual([
      [
        ['minPrice', '800'],
        ['maxPrice', '1200'],
      ],
    ]);
    // Portugal writes the segment with an `m`.
    expect(readFilters(PT, 'com-preco-min_800,preco-max_1200')).toEqual([
      [
        ['minPrice', '800'],
        ['maxPrice', '1200'],
      ],
    ]);
    expect(readFilters(ES, 'con-metros-cuadrados-mas-de_60')).toEqual([[['minSize', '60']]]);
  });

  it('gives up on a tick-box it was never taught, and leaves the search to the website', () => {
    expect(readFilters(ES, 'con-de-dos-dormitorios')).toBeNull();
    expect(
      translateSearchUrl(ES, 'https://www.idealista.com/alquiler-viviendas/madrid-madrid/con-piscina/'),
    ).toBeNull();
  });

  it('carries a plain Spanish and Portuguese search over', () => {
    expect(
      translateSearchUrl(ES, 'https://www.idealista.com/alquiler-viviendas/madrid-madrid/con-precio-hasta_1200/'),
    ).toMatchObject({
      operation: 'rent',
      propertyType: 'homes',
      locationSlugs: ['madrid-madrid'],
      variants: [[['maxPrice', '1200']]],
    });

    expect(translateSearchUrl(PT, 'https://www.idealista.pt/arrendar-casas/lisboa/')).toMatchObject({
      operation: 'rent',
      propertyType: 'homes',
      locationSlugs: ['lisboa'],
      variants: [[]],
    });
  });
});

describe('the places a search url names', () => {
  it('spells a name the way the url does', () => {
    expect(slugify('Milano, Milano')).toBe('milano-milano');
    expect(slugify('Centro Storico, Milano')).toBe('centro-storico-milano');
    expect(slugify("Reggio nell'Emilia")).toBe('reggio-nell-emilia');
    expect(slugify('Forlì-Cesena')).toBe('forli-cesena');
  });
});

describe('the outline of an area the website names in a code', () => {
  it('decodes the polyline the map is drawn from', () => {
    // The example from the polyline format's own description, which is the format idealista serves.
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');

    expect(points).toHaveLength(3);
    // GeoJSON counts longitude first, which is the opposite of the order the polyline carries.
    expect(points[0][0]).toBeCloseTo(-120.2, 5);
    expect(points[0][1]).toBeCloseTo(38.5, 5);
    expect(points[1][0]).toBeCloseTo(-120.95, 5);
    expect(points[2][1]).toBeCloseTo(43.252, 5);
  });

  it('reads every ring of an outline made of several pieces', () => {
    const rings = parseOutline('((_p~iF~ps|U_ulLnnqC_mqNvxq`@)(_p~iF~ps|U_ulLnnqC_mqNvxq`@))');
    expect(rings).toHaveLength(2);
  });

  /**
   * An outline is drawn for a map and carries a point every few metres. One area of it runs to
   * sixty kilobytes, and a search naming four would be sent as a quarter of a megabyte of body.
   */
  it('drops the points the shape does not need', () => {
    const straight = Array.from({ length: 50 }, (_, index) => [9 + index * 0.01, 45]);
    // A corner the tolerance cannot swallow, so the ring keeps its shape.
    const bent = [...straight, [9.5, 45.5], [9, 45]];

    expect(simplifyRing(straight)).toHaveLength(2);
    expect(simplifyRing(bent).length).toBeLessThan(bent.length);
    expect(simplifyRing(bent)).toContainEqual([9.5, 45.5]);
  });
});

/**
 * What the tile host is allowed to be remembered as.
 *
 * An outline is cached for the lifetime of the process, because a border does not move. That makes
 * the difference between "there is no such area" and "the host could not be read just now" the
 * whole story: a 503 remembered as the former pinned the outline - and the location the outline is
 * what names - to null until Fredy was restarted, and every run of that job fell back to reading
 * the website behind DataDome for a search the api could have answered.
 */
describe('an area whose outline could not be read', () => {
  /** One ring, in the encoding the tile host serves borders in. */
  const OUTLINE = '((_p~iF~ps|U_ulLnnqC_mqNvxq`@))';

  /**
   * @param {Array<{ok: boolean, status: number, body?: string}>} answers one per request, in order
   * @returns {() => number} how many requests were made
   */
  function serve(answers) {
    let made = 0;
    vi.stubGlobal('fetch', () => {
      const answer = answers[Math.min(made, answers.length - 1)];
      made += 1;
      return Promise.resolve({ ...answer, text: () => Promise.resolve(answer.body ?? '') });
    });
    return () => made;
  }

  beforeEach(() => {
    resetZoneMemory();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is read again on the next run, and answers once the host is back', async () => {
    const made = serve([
      { ok: false, status: 503 },
      { ok: true, status: 200, body: OUTLINE },
    ]);

    await expect(outlineOf(IT, ['a5W'])).rejects.toThrow(/503/);
    await expect(outlineOf(IT, ['a5W'])).resolves.toMatchObject({ type: 'MultiPolygon' });
    expect(made()).toBe(2);
  });

  // A 429 is the host asking for less traffic, not a statement about the area.
  it('is read again after a refusal too', async () => {
    const made = serve([{ ok: false, status: 429 }]);

    await expect(outlineOf(IT, ['a5W'])).rejects.toThrow(/429/);
    await expect(outlineOf(IT, ['a5W'])).rejects.toThrow(/429/);
    expect(made()).toBe(2);
  });

  // A host that says the code does not exist is believed, and asked once.
  it('is believed when the host says there is no such area', async () => {
    const made = serve([{ ok: false, status: 404 }]);

    await expect(outlineOf(IT, ['a5W'])).resolves.toBeNull();
    await expect(outlineOf(IT, ['a5W'])).resolves.toBeNull();
    expect(made()).toBe(1);
  });
});

describe('the location a code stands for', () => {
  /**
   * Every advert inside an area carries the id of the location it belongs to, and the id all of
   * them share is the location itself. This is what gives a code its meaning back, since nothing
   * published maps one to the other.
   */
  it('is the deepest id every advert in the area sits under', () => {
    expect(sharedLocationId(['0-EU-IT-BS-02-012-099-01', '0-EU-IT-BS-02-013-002-03', '0-EU-IT-BS-02-012-100'])).toBe(
      '0-EU-IT-BS-02',
    );
  });

  /**
   * An advert whose point fell across a provincial border would otherwise pull the answer up to the
   * country, and a search for the country is not the search the user asked for.
   */
  it('ignores the odd advert that fell outside the province', () => {
    expect(sharedLocationId(['0-EU-IT-BG-09-001-x', '0-EU-IT-BG-09-002-y', '0-EU-IT-RM-01-001-097'])).toBe(
      '0-EU-IT-BG-09',
    );
  });

  it('has no answer where there is nothing to read', () => {
    expect(sharedLocationId([])).toBeNull();
    expect(sharedLocationId(['0-EU-IT'])).toBeNull();
  });
});

/**
 * What the api's abuse wall reads in a caller is burst traffic and flapping identities, and a
 * refusal of it - a 407, or the edge simply dropping the connection - outlasts the single error.
 * These tests pin how the requests walk past it: one at a time, a breath apart, and silent for a
 * while after a refusal rather than knocking harder.
 */
describe('the breath between requests, and the silence after a refusal', () => {
  const PATH = '/api/3.5/it/search';

  const ok = () => ({ ok: true, status: 200, json: () => Promise.resolve({ elementList: [] }) });
  const refused = () => ({ ok: false, status: 407, text: () => Promise.resolve('{"httpStatus":407}') });

  /**
   * The api, replaced by a doorkeeper that records the moment of every knock after the token one.
   *
   * @param {() => any} mood what the search endpoint answers
   * @returns {number[]} the fake-clock instants the endpoint was knocked at
   */
  function mockApi(mood) {
    const knocks = [];
    vi.stubGlobal('fetch', (url) => {
      if (String(url).includes('/api/oauth/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'token', expires_in: 43200 }),
        });
      }
      knocks.push(Date.now());
      return Promise.resolve(mood());
    });
    return knocks;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    resetPacing();
    forgetToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('walks requests out one at a time, a breath apart', async () => {
    const knocks = mockApi(ok);

    const pending = [call(IT, PATH), call(IT, PATH), call(IT, PATH)];
    await vi.runAllTimersAsync();

    for (const attempt of pending) await expect(attempt).resolves.toEqual({ elementList: [] });
    expect(knocks).toHaveLength(3);
    expect(knocks[1] - knocks[0]).toBeGreaterThanOrEqual(REQUEST_GAP_MS);
    expect(knocks[2] - knocks[1]).toBeGreaterThanOrEqual(REQUEST_GAP_MS);
  });

  it('goes quiet when the api answers 407, and fails fast inside the silence', async () => {
    const knocks = mockApi(refused);

    // The rejection handler is attached before the clock runs, so no rejection flies loose.
    const refusal = expect(call(IT, PATH)).rejects.toThrow(/407/);
    await vi.runAllTimersAsync();
    await refusal;

    // A minute into a quarter-hour silence the door is not knocked at all.
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(call(IT, PATH)).rejects.toThrow(/silent/);
    expect(knocks).toHaveLength(1);
  });

  it('asks again once the silence has passed, and one success clears the slate', async () => {
    let mood = refused;
    const knocks = mockApi(() => mood());

    const refusal = expect(call(IT, PATH)).rejects.toThrow(/407/);
    await vi.runAllTimersAsync();
    await refusal;

    mood = ok;
    await vi.advanceTimersByTimeAsync(15 * 60_000 + 1000);

    const probe = call(IT, PATH);
    const after = call(IT, PATH);
    await vi.runAllTimersAsync();
    await expect(probe).resolves.toEqual({ elementList: [] });
    await expect(after).resolves.toEqual({ elementList: [] });
    expect(knocks).toHaveLength(3);
  });

  it('doubles the silence every time the refusal outlasts it', async () => {
    const knocks = mockApi(refused);

    let refusal = expect(call(IT, PATH)).rejects.toThrow(/407/);
    await vi.runAllTimersAsync();
    await refusal;

    // Fifteen minutes later the refusal is still there, so the next silence is half an hour.
    await vi.advanceTimersByTimeAsync(15 * 60_000 + 1);
    refusal = expect(call(IT, PATH)).rejects.toThrow(/407/);
    await vi.runAllTimersAsync();
    await refusal;

    // Sixteen minutes into it the door stays unknocked...
    await vi.advanceTimersByTimeAsync(16 * 60_000);
    await expect(call(IT, PATH)).rejects.toThrow(/silent/);
    expect(knocks).toHaveLength(2);

    // ...and only the full half hour opens it again.
    await vi.advanceTimersByTimeAsync(14 * 60_000 + 1000);
    refusal = expect(call(IT, PATH)).rejects.toThrow(/407/);
    await vi.runAllTimersAsync();
    await refusal;
    expect(knocks).toHaveLength(3);
  });

  it('reads a slammed door only after several dropped connections in a row', async () => {
    let knocks = 0;
    vi.stubGlobal('fetch', (url) => {
      if (String(url).includes('/api/oauth/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'token', expires_in: 43200 }),
        });
      }
      knocks += 1;
      return Promise.reject(new TypeError('fetch failed'));
    });

    // One reset is weather, so the weather gets its retries...
    for (let i = 0; i < 3; i++) {
      const dropped = expect(call(IT, PATH)).rejects.toThrow('fetch failed');
      await vi.runAllTimersAsync();
      await dropped;
    }
    expect(knocks).toBe(3);

    // ...but by the third in a row the door is read as slammed, and stays unknocked.
    await expect(call(IT, PATH)).rejects.toThrow(/silent/);
    expect(knocks).toBe(3);
  });
});

/**
 * The first translator is idealista's own: the app opens idealista.it links by handing the url to
 * the api's parser and reading back the search in the api's own words. These tests pin what a run
 * builds out of that answer - one request where the flat covers the flats and the houses ride
 * beside it, the lists joined with the comma that means their union, the legacy fields dropped.
 */
describe("the portal's own parser", () => {
  /** The parser's answer for the drawn search, as the api spells it. */
  const PARSED = {
    filter: {
      operation: 'sale',
      propertyType: 'homes',
      maxPrice: 300000,
      shape: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [9.78, 45.62],
              [9.8, 45.68],
              [9.79, 45.62],
            ],
          ],
        ],
      },
      auction: 'excludeAuctions',
      flat: true,
      penthouse: false,
      duplex: false,
      bedrooms: '3,4,5',
      preservations: ['good', 'newDevelopment'],
      preservation: 'good',
      newDevelopment: true,
      subTypology: ['villa', 'terracedHouse', 'semidetachedHouse', 'independantHouse'],
      energyEfficiency: ['high', 'medium'],
      terrance: false,
    },
    target: 'listing',
  };

  const DRAWN_URL =
    'https://www.idealista.it/aree/vendita-case/con-prezzo_300000,appartamenti,case-indipendenti,' +
    'villette-bifamiliari,villette-a-schiera,ville-indipendenti,trilocali-3,quadrilocali-4,' +
    '5-locali-o-piu,nuova-costruzione,buono-stato,aste_no,alta-efficienza,media-efficienza/' +
    '?shape=%28%28qwnuGijvz%40%7DpHyrBwmH_oDsvEgsDqjE%7DsHoiDqeKwfAm%7ERrjBsaMlvEk%60Rh_LoyCxhF%7CgA%7CoGhxHfqH%7EaObeBfmR_KnsQexC%60nVezElyC%29%29';

  /**
   * The api, replaced by a router that answers the parser with `PARSED` and records every search
   * request's address and form body.
   *
   * @param {() => any} page what the search endpoint answers
   * @returns {{calls: {url: string, body: URLSearchParams}[]}} what the search endpoint was asked,
   *   in the order it was asked
   */
  function mockApi(page) {
    const calls = [];
    const parses = [];
    vi.stubGlobal('fetch', (url, init) => {
      const address = String(url);
      if (address.includes('/api/oauth/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'token', expires_in: 43200 }),
        });
      }
      if (address.includes('/deeplinks/parse/search')) {
        parses.push(address);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(PARSED) });
      }
      calls.push({ url: address, body: new URLSearchParams(String(init?.body)) });
      return Promise.resolve({ ok: true, status: 200, json: page });
    });
    return { calls, parses };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    resetPacing();
    forgetToken();
    resetSearchMemory();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('asks the parser, and runs the search it describes', async () => {
    const { calls } = mockApi(() => ({ elementList: [], totalPages: 0 }));

    const pending = searchListings(IT, DRAWN_URL);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual([]);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('searchType=drawn');
    expect(calls[0].body.get('flat')).toBe('1');
    expect(calls[0].body.get('subTypology')).toBe('villa,terracedHouse,semidetachedHouse,independantHouse');
    expect(calls[0].body.get('preservations')).toBe('good,newDevelopment');
    expect(calls[0].body.get('bedrooms')).toBe('3,4,5');
    expect(calls[0].body.get('energyEfficiency')).toBe('high,medium');
    expect(calls[0].body.get('maxPrice')).toBe('300000');
    expect(calls[0].body.get('auction')).toBe('excludeAuctions');
    // The shape travels as the parser decoded it, and the legacy copies of the preservation stay
    // out of the request.
    expect(JSON.parse(calls[0].body.get('shape'))).toMatchObject({ type: 'MultiPolygon' });
    expect(calls[0].body.get('preservation')).toBeNull();
    expect(calls[0].body.get('newDevelopment')).toBeNull();
  });

  /**
   * What the parser answers depends on the url and on nothing else, and a job runs its url every
   * few minutes for months. Asking again each time spends a paced request on a question that was
   * answered the first time the job ran.
   */
  it('is asked once per url, however often the job runs it', async () => {
    const { parses } = mockApi(() => ({ elementList: [], totalPages: 0 }));

    const first = searchListings(IT, DRAWN_URL);
    await vi.runAllTimersAsync();
    await first;

    const second = searchListings(IT, DRAWN_URL);
    await vi.runAllTimersAsync();
    await second;

    expect(parses).toHaveLength(1);
    expect(parses[0]).toContain('/api/3.5/it/deeplinks/parse/search');
  });

  /**
   * The parser answers the same sentinel for a url it will not serve and for a 200 carrying
   * something that is not an answer at all - a maintenance document, an error page, a cache's
   * holding reply. Remembering it meant one odd minute downgraded that job to the website path for
   * the lifetime of the process, and nothing short of a restart brought it back.
   */
  it('does not remember an answer that was not a search', async () => {
    const calls = [];
    const parses = [];
    vi.stubGlobal('fetch', (url, init) => {
      const address = String(url);
      if (address.includes('/api/oauth/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'token', expires_in: 43200 }),
        });
      }
      if (address.includes('/deeplinks/parse/search')) {
        parses.push(address);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(parses.length === 1 ? { target: 'error' } : PARSED),
        });
      }
      calls.push({ url: address, body: new URLSearchParams(String(init?.body)) });
      return Promise.resolve({ ok: true, status: 200, json: () => ({ elementList: [], totalPages: 0 }) });
    });

    const first = searchListings(IT, DRAWN_URL);
    await vi.runAllTimersAsync();
    await first;
    // The odd answer sends this run to the local table, which reads the url as one search per
    // building condition.
    expect(calls).toHaveLength(2);

    const second = searchListings(IT, DRAWN_URL);
    await vi.runAllTimersAsync();
    await second;

    // Asked again, and the good answer is the one that runs: the parser's reading is a single
    // search, so exactly one more request went to the search endpoint.
    expect(parses).toHaveLength(2);
    expect(calls).toHaveLength(3);
  });

  it('falls back to the local translation when the parser does not answer', async () => {
    const calls = [];
    vi.stubGlobal('fetch', (url, init) => {
      const address = String(url);
      if (address.includes('/api/oauth/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'token', expires_in: 43200 }),
        });
      }
      if (address.includes('/deeplinks/parse/search')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve(''),
          json: () => Promise.resolve({}),
        });
      }
      calls.push({ url: address, body: new URLSearchParams(String(init?.body)) });
      return Promise.resolve({ ok: true, status: 200, json: () => ({ elementList: [], totalPages: 0 }) });
    });

    const pending = searchListings(IT, DRAWN_URL);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual([]);

    // The local table reads the same url: the flat with the houses beside it, once per building
    // condition the api takes one of.
    expect(calls).toHaveLength(2);
    for (const search of calls) {
      expect(search.url).toContain('searchType=drawn');
      expect(search.body.get('flat')).toBe('1');
      expect(search.body.get('subTypology')).toBe('independantHouse,semidetachedHouse,terracedHouse,villa');
      expect(['newdevelopment', 'good']).toContain(search.body.get('preservation'));
    }
  });
});

/**
 * A search answers newest first, and the adverts carry no date a watermark could be taken from.
 * The head is therefore read whole the first time a search runs - anything older never comes
 * back once skipped - and settled for a few pages from then on.
 */
describe('the pages a run reads', () => {
  const DRAWN_URL =
    'https://www.idealista.it/aree/vendita-case/con-prezzo_300000/?shape=%28%28qwnuGijvz%40%7DpHyrBwmH_oDsvEgsDqjE%7DsHoiDqeKwfAm%7ERrjBsaMlvEk%60Rh_LoyCxhF%7CgA%7CoGhxHfqH%7EaObeBfmR_KnsQexC%60nVezElyC%29%29';

  /** A search that stays full for five pages, fifty adverts on each. */
  function mockDeepSearch() {
    vi.stubGlobal('fetch', (url, init) => {
      if (String(url).includes('/api/oauth/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'token', expires_in: 43200 }),
        });
      }
      const page = Number(/numPage=(\d+)/.exec(String(init?.body))?.[1] ?? 1);
      const elementList = page <= 5 ? Array.from({ length: 50 }, (_, i) => ({ propertyCode: `${page}-${i}` })) : [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ elementList, actualPage: page, totalPages: 5 }),
      });
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    resetPacing();
    forgetToken();
    resetSearchMemory();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('walks a whole search the first time, and settles for its head from then on', async () => {
    mockDeepSearch();

    const first = searchListings(IT, DRAWN_URL);
    await vi.runAllTimersAsync();
    await expect(first).resolves.toHaveLength(250);

    const second = searchListings(IT, DRAWN_URL);
    await vi.runAllTimersAsync();
    // Three pages of fifty: the head every other run reads.
    await expect(second).resolves.toHaveLength(150);
  });
});

/**
 * A token is granted by one country's api to this installation, and the other two have never heard
 * of it. Holding one token for all three was the shape of the bug this pins: the second country's
 * requests would carry the first one's bearer and be refused, run after run.
 */
describe('the token each country grants', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPacing();
    forgetToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is minted per api host, and never carried across', async () => {
    /** @type {string[]} */
    const minted = [];
    /** @type {Array<{url: string, bearer: string}>} */
    const asked = [];

    vi.stubGlobal('fetch', (url, init) => {
      const address = String(url);
      if (address.includes('/api/oauth/token')) {
        minted.push(address);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: `token-for-${minted.length}`, expires_in: 43200 }),
        });
      }
      asked.push({ url: address, bearer: String(init?.headers?.Authorization ?? '') });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ elementList: [] }) });
    });

    const pending = [call(IT, '/api/3.5/it/search'), call(ES, '/api/3.5/es/search'), call(IT, '/api/3.5/it/search')];
    await vi.runAllTimersAsync();
    for (const attempt of pending) await attempt;

    // One token per host, and the third request reuses the one its host already granted.
    expect(minted.map((url) => new URL(url).origin)).toEqual(['https://app.idealista.it', 'https://app.idealista.com']);

    expect(asked[0].url).toContain('https://app.idealista.it/api/3.5/it/search');
    expect(asked[1].url).toContain('https://app.idealista.com/api/3.5/es/search');
    expect(asked[0].bearer).toBe('Bearer token-for-1');
    expect(asked[1].bearer).toBe('Bearer token-for-2');
    expect(asked[2].bearer).toBe('Bearer token-for-1');
  });
});
