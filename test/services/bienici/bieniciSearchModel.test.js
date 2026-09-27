/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFilters, parseSearchUrl, placeMatchesSlug } from '../../../lib/services/bienici/search-model.js';
import { resolveZoneIds, searchAds } from '../../../lib/services/bienici/api.js';

const BASE = 'https://www.bienici.com/recherche';

/**
 * The translation is copied from the site's own url parser, so every case here is one the site
 * writes itself - and getting one wrong is silent: the endpoint answers a wider search without
 * complaint.
 */
describe('#bienici search model', () => {
  it('reads the deal, the place, the type, the rooms and the query filters', () => {
    const { filters, places, extensionType } = parseSearchUrl(
      `${BASE}/location/paris-75000/appartement/2-pieces-et-plus?prix-max=2000&surface-min=30`,
    );

    expect(filters).toEqual({
      filterType: 'rent',
      propertyType: ['flat'],
      minRooms: 2,
      maxPrice: 2000,
      minArea: 30,
      onTheMarket: [true],
    });
    expect(places).toEqual([
      { slug: 'paris-75000', q: 'paris-75000', type: 'city,delegated-city,department,postalCode,region' },
    ]);
    expect(extensionType).toBeNull();
  });

  it('reads several deals, several types and several places', () => {
    const { filters, places } = parseSearchUrl(
      `${BASE}/achat,location/lyon-69000,villeurbanne-69100/maisonvilla,appartement`,
    );

    expect(filters.filterType).toEqual(['buy', 'rent']);
    expect(filters.propertyType).toEqual(['house', 'flat']);
    expect(places.map((place) => place.slug)).toEqual(['lyon-69000', 'villeurbanne-69100']);
  });

  it("searches the site's default homes, and all of France, when the url names neither", () => {
    const { filters, places } = parseSearchUrl(`${BASE}/achat/france`);

    expect(filters.filterType).toBe('buy');
    expect(filters.propertyType).toEqual(['house', 'flat', 'loft', 'castle', 'townhouse']);
    expect(places).toEqual([]);
  });

  it('reads every spelling of a room count', () => {
    const rooms = (segment) => {
      const { filters } = parseSearchUrl(`${BASE}/location/paris-75000/appartement/${segment}`);
      return [filters.minRooms, filters.maxRooms];
    };

    expect(rooms('studio')).toEqual([undefined, 1]);
    expect(rooms('3-pieces')).toEqual([3, 3]);
    expect(rooms('3-pieces-et-moins')).toEqual([undefined, 3]);
    expect(rooms('de-2-a-4-pieces')).toEqual([2, 4]);
    expect(rooms('1-piece-et-plus')).toEqual([1, undefined]);
    expect(rooms('2-pi%C3%A8ces-et-plus')).toEqual([2, undefined]);
  });

  it('reads the yes/no filters, including the one whose yes is not true', () => {
    const { filters } = parseSearchUrl(
      `${BASE}/location/paris-75000/appartement?ascenseur=oui&meuble=non&fibre=oui&disponible=oui-non`,
    );

    expect(filters.hasElevator).toBe(true);
    expect(filters.isFurnished).toBe(false);
    expect(filters.opticalFiberStatus).toBe('deploye');
    expect(filters.onTheMarket).toEqual([true, false]);
  });

  it('reads the lists, the text filters and the extension', () => {
    const { filters, extensionType } = parseSearchUrl(
      `${BASE}/location/paris-75000/appartement?classification-energetique=A,B&reference=X12&recherche-etendue=etendue`,
    );

    expect(filters.energyClassification).toEqual(['A', 'B']);
    expect(filters.reference).toBe('X12');
    expect(extensionType).toBe('extended');
  });

  // The endpoint refuses the site's own word for "no extension", so it must never be sent.
  it('asks for no extension when the url turns it off', () => {
    expect(parseSearchUrl(`${BASE}/location/paris-75000?recherche-etendue=non-etendue`).extensionType).toBeNull();
  });

  it('looks a delegated commune up as one', () => {
    const [place] = parseSearchUrl(`${BASE}/location/la-cochere-61310-associee`).places;
    expect(place).toEqual({ slug: 'la-cochere-61310-associee', q: 'la-cochere-61310', type: 'delegated-city' });
  });

  it('searches a part of the map by the boundary the url carries for it', () => {
    const { filters, places } = parseSearchUrl(`${BASE}/location/zone-recherchee/appartement?limite=kayiHqc_L%3FunsA`);
    expect(places).toEqual([]);
    expect(filters.limit).toBe('kayiHqc_L?unsA');
  });

  it('refuses a part of the map that comes without its boundary, which would be all of France', () => {
    expect(() => parseSearchUrl(`${BASE}/location/zone-recherchee/appartement`)).toThrow(/limite/);
  });

  it('ignores the view state, the sort order and campaign tags', () => {
    const { filters } = parseSearchUrl(
      `${BASE}/location/paris-75000?mode=liste&carte=invisible&camera=12_2.3_48.8&page=3&tri=prix-asc&utm_source=x&gclid=y` +
        `&xtor=EPR-1&at_medium=email&msclkid=z`,
    );
    expect(filters).toEqual({ filterType: 'rent', propertyType: expect.any(Array), onTheMarket: [true] });
  });

  it('refuses a filter it cannot translate rather than searching wider', () => {
    expect(() => parseSearchUrl(`${BASE}/location/paris-75000?piscine-chauffee=oui`)).toThrow(/piscine-chauffee/);
  });

  it('refuses a figure that is not one', () => {
    expect(() => parseSearchUrl(`${BASE}/location/paris-75000?prix-max=beaucoup`)).toThrow(/not a number/);
  });

  it('refuses a property type it does not know', () => {
    expect(() => parseSearchUrl(`${BASE}/location/paris-75000/yourte`)).toThrow(/yourte/);
  });

  it("refuses the areas Bien'ici keeps on its own servers", () => {
    expect(() => parseSearchUrl(`${BASE}/location/dessin-5f3a/appartement`)).toThrow(/drawn on the map/);
    expect(() => parseSearchUrl(`${BASE}/location/temps-de-transport-5f3a/appartement`)).toThrow(/travel time/);
  });

  it('refuses a search of sold properties, which are not adverts', () => {
    expect(() => parseSearchUrl(`${BASE}/achat/paris-75000?biens-vendus=oui`)).toThrow(/already sold/);
  });

  it('refuses a url that is not a search', () => {
    expect(() => parseSearchUrl('https://www.bienici.com/annonce/immo-facile-1')).toThrow(/not a Bien'ici search/);
  });
});

describe('#bienici place check', () => {
  it('accepts the place a slug names', () => {
    expect(placeMatchesSlug('paris-75000', { name: 'Paris', postalCodes: ['75000'] })).toBe(true);
    expect(placeMatchesSlug('paris-11e-75011', { name: 'Paris 11e', postalCodes: ['75011'] })).toBe(true);
    expect(placeMatchesSlug('hauts-de-seine-92', { name: 'Hauts-de-Seine', postalCodes: [] })).toBe(true);
    expect(placeMatchesSlug('ile-de-france', { name: 'Île-de-France' })).toBe(true);
    expect(placeMatchesSlug('75011', { name: 'Paris 11e', postalCodes: ['75011'] })).toBe(true);
    expect(placeMatchesSlug('la-cochere-61310-associee', { name: 'La Cochère', postalCodes: ['61310'] })).toBe(true);
  });

  // The lookup answers with the name as it is written, ligature and all, while the url spells it
  // out. Refusing the pair stopped every job in these towns for good, since pasting the url again
  // brings back the same url.
  it('accepts a place whose name carries a ligature', () => {
    expect(
      placeMatchesSlug('vandoeuvre-les-nancy-54500', { name: 'Vandœuvre-lès-Nancy', postalCodes: ['54500'] }),
    ).toBe(true);
    expect(placeMatchesSlug('ploemeur-56270', { name: 'Plœmeur', postalCodes: ['56270'] })).toBe(true);
  });

  // The lookup always answers with something; these are what it answers for slugs it cannot find.
  it('refuses a guess', () => {
    expect(placeMatchesSlug('nowhere-99999', { name: 'La Cochère', postalCodes: ['61310'] })).toBe(false);
    expect(placeMatchesSlug('paris-15e-75015', { name: 'Paris', postalCodes: ['75000'] })).toBe(false);
    expect(placeMatchesSlug('paris-75099', { name: 'Paris', postalCodes: ['75000'] })).toBe(false);
    expect(placeMatchesSlug('75099', { name: 'Paris', postalCodes: ['75000'] })).toBe(false);
  });
});

describe('#bienici request', () => {
  it('always asks for the newest adverts first, within the zones', () => {
    const filters = buildFilters({ filterType: 'rent', sortBy: 'price', sortOrder: 'asc' }, ['-7444']);

    expect(filters).toMatchObject({
      size: 100,
      from: 0,
      page: 1,
      sortBy: 'publicationDate',
      sortOrder: 'desc',
      zoneIdsByTypes: { zoneIds: ['-7444'] },
    });
  });

  it('searches all of France without zones', () => {
    expect(buildFilters({ filterType: 'buy' }, [])).not.toHaveProperty('zoneIdsByTypes');
  });
});

describe('#bienici transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const answer = (body, status = 200) => vi.fn(async () => ({ ok: status === 200, status, json: async () => body }));

  it('resolves the places into their zones', async () => {
    vi.stubGlobal('fetch', answer({ name: 'Paris', postalCodes: ['75000'], zoneIds: ['-7444'] }));
    const zones = await resolveZoneIds([{ slug: 'paris-75000', q: 'paris-75000', type: 'city' }], 'u');
    expect(zones).toEqual(['-7444']);
  });

  it("stops rather than searching the lookup's best guess", async () => {
    vi.stubGlobal('fetch', answer({ name: 'La Cochère', postalCodes: ['61310'], zoneIds: ['-3313671'] }));
    await expect(resolveZoneIds([{ slug: 'nowhere-99999', q: 'nowhere-99999', type: 'city' }], 'u')).rejects.toThrow(
      /La Cochère/,
    );
  });

  // A slug names the same zones tomorrow as today, and asking again on every run of every job only
  // put a round trip per place in front of each search.
  it('looks a place up once, not on every run', async () => {
    const fetchMock = answer({ name: 'Lyon', postalCodes: ['69000'], zoneIds: ['-120965'] });
    vi.stubGlobal('fetch', fetchMock);
    const places = [{ slug: 'lyon-69000', q: 'lyon-69000', type: 'city' }];

    expect(await resolveZoneIds(places, 'u')).toEqual(['-120965']);
    expect(await resolveZoneIds(places, 'u')).toEqual(['-120965']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // A place Bien'ici renames has to reach the jobs searching it eventually.
  it('asks again once a day has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const fetchMock = answer({ name: 'Nantes', postalCodes: ['44000'], zoneIds: ['-59874'] });
      vi.stubGlobal('fetch', fetchMock);
      const places = [{ slug: 'nantes-44000', q: 'nantes-44000', type: 'city' }];

      await resolveZoneIds(places, 'u');
      vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
      await resolveZoneIds(places, 'u');

      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not remember a lookup that failed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => null })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ name: 'Lille', postalCodes: ['59000'], zoneIds: ['-58404'] }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const places = [{ slug: 'lille-59000', q: 'lille-59000', type: 'city' }];

    await expect(resolveZoneIds(places, 'u')).rejects.toThrow(/answered 503/);
    expect(await resolveZoneIds(places, 'u')).toEqual(['-58404']);
  });

  // Several places used to be asked one after the other; the zones still come back in the order
  // the url names the places, whichever lookup answers first.
  it('asks for several places at once and keeps their order', async () => {
    const pending = [];
    const bodies = {
      'rennes-35000': { name: 'Rennes', postalCodes: ['35000'], zoneIds: ['-54517'] },
      'brest-29200': { name: 'Brest', postalCodes: ['29200'], zoneIds: ['-1076124'] },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url) =>
          new Promise((resolve) => {
            const body = bodies[new URL(url).searchParams.get('q')];
            pending.push(() => resolve({ ok: true, status: 200, json: async () => body }));
          }),
      ),
    );

    const zones = resolveZoneIds(
      [
        { slug: 'rennes-35000', q: 'rennes-35000', type: 'city' },
        { slug: 'brest-29200', q: 'brest-29200', type: 'city' },
      ],
      'u',
    );
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1]();
    pending[0]();

    expect(await zones).toEqual(['-54517', '-1076124']);
  });

  it('names the reason a search was refused', async () => {
    vi.stubGlobal('fetch', answer({ success: false, errors: [{ field: 'minArea' }] }));
    await expect(searchAds({ filters: { filterType: 'rent' }, extensionType: null }, [])).rejects.toThrow(/minArea/);
  });

  it('sends the extension only when the url asked for one', async () => {
    const fetchMock = answer({ total: 0, realEstateAds: [] });
    vi.stubGlobal('fetch', fetchMock);

    await searchAds({ filters: { filterType: 'rent' }, extensionType: 'extended' }, []);
    await searchAds({ filters: { filterType: 'rent' }, extensionType: null }, []);

    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('extensionType')).toBe('extended');
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.has('extensionType')).toBe(false);
  });
});
