/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import queryStringMutator from '../../lib/services/queryStringMutator.js';
import { config } from '../../lib/provider/casa.js';
import { readFilters, toApiValue } from '../../lib/services/casa/search-filters.js';
import { clearPlaceCache, resolvePlace, LEVELS } from '../../lib/services/casa/geography.js';
import { translateSearchUrl } from '../../lib/services/casa/web-translator.js';

/**
 * Casa.it is read through the api its android app talks to, and a job holds the url a user copied
 * out of their browser, so the whole provider rests on reading that url correctly.
 *
 * This api never says no. It drops a filter name it does not know without a word and answers a
 * property group it does not know with the residential one, so every mistake below would show up
 * as a search that quietly returns the wrong adverts rather than as a failure. That is what these
 * tests are for.
 *
 * `reverse-engineered-casa.md` records where each fact was measured.
 */

/** What the place lookup answers for `roma`: the province and the town share the name. */
const ROMA = {
  data: {
    results: [
      { hkey: 'ed427fcb', id: 'IT-LAZ-RM', level: 6, name: 'Roma', slugs: 'roma', type: 'province' },
      { hkey: 'a0d22860', id: 'IT-LAZ-058091', level: 9, name: 'Roma', slugs: 'roma', type: 'main_town' },
    ],
  },
};

/**
 * @param {Record<string, any>} byQuery
 * @returns {any}
 */
function serve(byQuery) {
  return vi.fn(async (url) => {
    const asked = new URL(String(url)).searchParams.get('query') ?? '';
    const found = byQuery[asked];
    if (found == null) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => found };
  });
}

describe('the filters a casa.it url carries', () => {
  /**
   * The website encodes a value with an encoder of its own: a space becomes `+`, a comma becomes
   * `%2C`. The api is fed the result of that verbatim, so the list separator in the url is the
   * escaped comma while the `+` inside an item has to survive untouched.
   *
   * Decoding the value on the way through is the expensive mistake here. `casa+indipendente` finds
   * the houses and `casa indipendente` finds none of them, and the api reports neither as an error.
   */
  it('splits a list on the escaped comma and leaves the plus alone', () => {
    const read = readFilters('?propertyTypes=casa+indipendente%2Cvilla%2Cvilletta+a+schiera');

    expect(read?.filters['property.types']).toEqual(['casa+indipendente', 'villa', 'villetta+a+schiera']);
  });

  it('pairs the two ends of a range into the one object the api takes', () => {
    const read = readFilters('?priceMin=200000&priceMax=450000&mqMin=80&numRoomsMin=3');

    expect(read?.filters).toMatchObject({
      price: { gte: 200000, lte: 450000 },
      surface: { gte: 80 },
      rooms: { gte: 3 },
    });
  });

  it('reads a figure as a number and a word as a word', () => {
    const read = readFilters('?priceMin=200000&tr=vendita&buildingCondition=abitabile');

    expect(read?.filters.price.gte).toBe(200000);
    expect(read?.filters['transaction.type']).toBe('vendita');
    expect(read?.filters.building_condition).toEqual(['abitabile']);
  });

  it('keeps the area out of the filters, for the translator to read', () => {
    const read = readFilters('?tr=vendita&geopolygon=%7B%22polygon%22%3A%5B%5D%7D');

    expect(read?.area.geopolygon).toBe('{"polygon":[]}');
    expect(read?.filters.geopolygon).toBeUndefined();
  });

  it('drops the page, which belongs to the request rather than to the search', () => {
    expect(readFilters('?tr=vendita&page=4')?.filters.page).toBeUndefined();
  });

  it('reads a toggle into the boolean of the same name the api keeps it under', () => {
    const read = readFilters('?exclude_auction=true&has_swimming_pool=true&lift=false');

    expect(read?.filters).toMatchObject({ exclude_auction: true, has_swimming_pool: true, lift: false });
  });

  /**
   * The site's auction toggle is three-state in the url and two filters in the api: asking for
   * auctions only, or for everything but them.
   */
  it('reads the auction toggle into the filter each of its states means', () => {
    expect(readFilters('?is_auction=true')?.filters).toEqual({ only_auction: true });
    expect(readFilters('?is_auction=false')?.filters).toEqual({ exclude_auction: true });
    expect(readFilters('?is_auction=perhaps')).toBeNull();
  });

  it('splits the balcony list into the two booleans the api keeps them under', () => {
    expect(readFilters('?balconyAndTerrace=balcone%2Cterrazzo')?.filters).toEqual({ balcony: true, terrace: true });
    expect(readFilters('?balconyAndTerrace=terrazzo')?.filters).toEqual({ terrace: true });
    // A value outside the pair the site writes would be dropped by the api without a word.
    expect(readFilters('?balconyAndTerrace=veranda')).toBeNull();
  });

  it('bounds the bathrooms and pins an exact room count', () => {
    expect(readFilters('?numBaths=2')?.filters.bathrooms).toEqual({ gte: 2 });
    expect(readFilters('?numRooms=2')?.filters.rooms).toEqual({ gte: 2, lte: 2 });
  });

  /**
   * The level is the one value the api keeps decoded: `piano+terra` is refused with a bare 500
   * while `piano terra` answers. Every other multi-word value in the table is the other way round.
   */
  it('sends a level with real spaces, the one form the api takes', () => {
    expect(readFilters('?level=piano+terra')?.filters.level).toBe('piano terra');
    expect(readFilters('?level=piano%20terra')?.filters.level).toBe('piano terra');
    expect(readFilters('?level=3')?.filters.level).toBe('3');
  });

  it('reads a category the way the path segment would have been read', () => {
    expect(readFilters('?category=residenziale')?.filters.property_type_group).toBe('case');
    expect(readFilters('?category=commerciale')?.filters.property_type_group).toBe('commerciale');
    // The api answers a group it does not know with the residential one, which would silently
    // widen the search past every holiday home the url meant to exclude.
    expect(readFilters('?category=vacanze')).toBeNull();
  });

  it('hands the comuni-limitrofi toggle over as a modifier, not a filter', () => {
    expect(readFilters('?surrounding=true')?.modifiers).toEqual({ with_surroundings: true });
    expect(readFilters('?surrounding=false')?.modifiers).toEqual({});
    expect(readFilters('?surrounding=perhaps')).toBeNull();
  });

  it('carries the lists and scalars the newer filters arrived with', () => {
    const read = readFilters('?furniture=partially%2Cfull&zones=a0d22860%2Ced427fcb&publication_date=7d');

    expect(read?.filters.furniture).toEqual(['partially', 'full']);
    expect(read?.filters.zone).toEqual(['a0d22860', 'ed427fcb']);
    expect(read?.filters.publication_date).toBe('7d');
  });

  /**
   * Trackers and the site's own bookkeeping ride along on real urls. They name nothing the search
   * could lose, so dropping them keeps the url translatable; an unknown *filter* still refuses the
   * whole url, because a filter that went missing would widen the search in silence.
   */
  it('drops the trackers and bookkeeping a shared url carries without losing the search', () => {
    const read = readFilters(
      '?tr=vendita&priceMax=330000&utm_source=google&gclid=Cj0K&t=1690000000&isRoomsNumber=true&precision=6&at_medium=paidsearch&source=refinements',
    );

    expect(read).not.toBeNull();
    expect(read?.filters).toEqual({ 'transaction.type': 'vendita', price: { lte: 330000 } });
  });

  it('hands the url its q untouched, for the translator to read as a place', () => {
    expect(readFilters('?q=276e3467')?.area.q).toBe('276e3467');
  });

  /**
   * Passing an unknown name through would be worse than refusing it: this api ignores what it does
   * not recognise, so the search would run without that filter and nobody would be told.
   */
  it('refuses a url carrying a filter it has no counterpart for', () => {
    expect(readFilters('?tr=vendita&qualcosaDiNuovo=1')).toBeNull();
  });

  /**
   * A job's url does not reach the provider as the user wrote it: the pipeline appends the sort and
   * rewrites the query string on the way. Both halves of that broke this provider once.
   *
   * The sort arrives in the website's spelling, which is not a filter and must not be read as an
   * unknown one - that refused every url and sent every run to the browser. And the rewriter turns
   * a `+` back into `%20`, which the api accepts and matches nothing with.
   */
  it('survives the rewriting the pipeline does to a job url on the way here', () => {
    const url = 'https://www.casa.it/srp/map/?tr=vendita&propertyTypes=casa+indipendente%2Cvilla&priceMax=450000';
    const mutated = queryStringMutator(url, config.sortByDateParam);

    expect(mutated, 'the rewriter is what turns the plus back into a space').toContain('casa%20indipendente');

    const read = readFilters(new URL(mutated).search);
    expect(read, 'the appended sort must not read as an unknown filter').not.toBeNull();
    expect(read?.filters['property.types']).toEqual(['casa+indipendente', 'villa']);
    expect(read?.filters.sortType).toBeUndefined();
  });

  it('writes a value the way casa.it writes it, however the url spelled it', () => {
    expect(toApiValue('casa+indipendente')).toBe('casa+indipendente');
    expect(toApiValue('casa%20indipendente')).toBe('casa+indipendente');
    expect(toApiValue('villetta a schiera')).toBe('villetta+a+schiera');
    // Accents are stripped and an apostrophe becomes a space, which is what its own encoder does.
    expect(toApiValue('citt%C3%A0+studi')).toBe('citta+studi');
  });
});

describe('the place a casa.it url names', () => {
  /** @type {any} */
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    clearPlaceCache();
    globalThis.fetch = serve({ roma: ROMA });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /**
   * A name alone does not identify a place, and the id casa.it prints elsewhere is not accepted by
   * the search - sent as `id` it is ignored and the search widens to the whole country.
   */
  it('answers with the key of the level asked for', async () => {
    expect(await resolvePlace('roma')).toEqual({ hkey: 'a0d22860', level: 9 });
    clearPlaceCache();
    expect(await resolvePlace('roma', [LEVELS.province])).toEqual({ hkey: 'ed427fcb', level: 6 });
  });

  it('has no answer for a place the lookup does not know', async () => {
    expect(await resolvePlace('nowhere-at-all')).toBeNull();
  });

  /**
   * A place keeps its key, so a resolved lookup is remembered for the lifetime of the process. That
   * makes "no such place" and "the service could not be read just now" two different answers, and
   * they used to be the same one: a 503 remembered as the former sent every run of every job
   * searching that town back to rendering the website, until Fredy was restarted.
   */
  it('asks again after a failure, and answers once the service is back', async () => {
    let asked = 0;
    globalThis.fetch = vi.fn(async () => {
      asked += 1;
      return asked === 1
        ? { ok: false, status: 503, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ROMA };
    });

    expect(await resolvePlace('roma')).toBeNull();
    expect(await resolvePlace('roma')).toEqual({ hkey: 'a0d22860', level: 9 });
    expect(asked).toBe(2);
  });

  it('asks once for a place the catalogue says it does not have', async () => {
    let asked = 0;
    globalThis.fetch = vi.fn(async () => {
      asked += 1;
      return { ok: false, status: 404, json: async () => ({}) };
    });

    expect(await resolvePlace('nowhere-at-all')).toBeNull();
    expect(await resolvePlace('nowhere-at-all')).toBeNull();
    expect(asked).toBe(1);
  });
});

describe('the search a casa.it url describes', () => {
  /** @type {any} */
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    clearPlaceCache();
    globalThis.fetch = serve({ roma: ROMA });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('reads a town search out of its path', async () => {
    const search = await translateSearchUrl('https://www.casa.it/affitto/residenziale/roma/');

    expect(search).toEqual({
      where: [{ hkey: 'a0d22860', level: 9 }],
      filters: { 'transaction.type': 'affitto', property_type_group: 'case' },
      modifiers: {},
    });
  });

  /**
   * The url writes a point as [lat, lon] and the api reads it as [lon, lat]. Sent in the url's own
   * order the api answers nothing at all, which reads as a search with no results rather than as
   * the mistake it is.
   */
  it('turns a drawn area the way round the api reads it', async () => {
    const ring = '{"polygon":[[45.6,9.8],[45.7,9.9],[45.5,10.0],[45.6,9.8]]}';
    const search = await translateSearchUrl(
      `https://www.casa.it/srp/map/?tr=vendita&geopolygon=${encodeURIComponent(ring)}`,
    );

    expect(search?.where).toEqual([
      {
        geo: {
          polygon: [
            [9.8, 45.6],
            [9.9, 45.7],
            [10.0, 45.5],
            [9.8, 45.6],
          ],
        },
      },
    ]);
  });

  /**
   * The url wraps the circle in a list, and the centre is the one coordinate pair that is *not*
   * swapped: the api reads it [lat, lon], the order the url already carries.
   */
  it('unwraps a drawn circle and keeps its centre the way round the api reads it', async () => {
    const drawn = '{"circle":[{"distance":54281.68,"center":[45.47069,9.18998]}]}';
    const search = await translateSearchUrl(
      `https://www.casa.it/srp/map/?tr=vendita&geocircle=${encodeURIComponent(drawn)}`,
    );

    expect(search?.where).toEqual([{ geo: { center: [45.47069, 9.18998], distance: 54281.68 } }]);
  });

  /**
   * The api has no box of its own - the shapes it answers are the polygon and the circle - so the
   * rectangle the url names with two corners is sent as the ring it is.
   */
  it('sends a drawn box as the rectangle it is', async () => {
    const drawn = '{"bbox":[[42.339,12.197],[42.2607,12.3405]]}';
    const search = await translateSearchUrl(
      `https://www.casa.it/srp/map/?tr=vendita&geobounds=${encodeURIComponent(drawn)}`,
    );

    expect(search?.where).toEqual([
      {
        geo: {
          polygon: [
            [12.197, 42.339],
            [12.3405, 42.339],
            [12.3405, 42.2607],
            [12.197, 42.2607],
            [12.197, 42.339],
          ],
        },
      },
    ]);
  });

  /**
   * A drawn search names the place it sits in with `q`, and that hkey is what the site's own
   * request searches by. With a shape drawn the shape wins - it is what was asked for - and with
   * nothing drawn the place is still a search the api can be asked for.
   */
  it('falls back to the place a drawn search names when nothing usable was drawn', async () => {
    const search = await translateSearchUrl('https://www.casa.it/srp/map/?tr=vendita&q=62125490');

    expect(search?.where).toEqual([{ hkey: '62125490' }]);
    expect(search?.filters).toEqual({ 'transaction.type': 'vendita' });
  });

  it('prefers the drawn shape over the place it sits in', async () => {
    const ring = '{"polygon":[[45.6,9.8],[45.7,9.9],[45.5,10.0],[45.6,9.8]]}';
    const search = await translateSearchUrl(
      `https://www.casa.it/srp/map/?tr=vendita&q=62125490&geopolygon=${encodeURIComponent(ring)}`,
    );

    expect(search?.where).toEqual([
      {
        geo: {
          polygon: [
            [9.8, 45.6],
            [9.9, 45.7],
            [10.0, 45.5],
            [9.8, 45.6],
          ],
        },
      },
    ]);
  });

  it('carries the comuni-limitrofi toggle into the request modifiers', async () => {
    const search = await translateSearchUrl('https://www.casa.it/affitto/residenziale/roma/?surrounding=true');

    expect(search?.modifiers).toEqual({ with_surroundings: true });
  });

  it('gives up on a url it cannot read whole, so the caller renders it instead', async () => {
    // A category outside the confirmed table: the api would answer with the residential one.
    expect(await translateSearchUrl('https://www.casa.it/vendita/commerciale/roma/')).toBeNull();
    // A place the lookup does not know.
    expect(await translateSearchUrl('https://www.casa.it/vendita/residenziale/nowhere-at-all/')).toBeNull();
    // A drawn search with nothing drawn.
    expect(await translateSearchUrl('https://www.casa.it/srp/map/?tr=vendita')).toBeNull();
    expect(await translateSearchUrl('not a url')).toBeNull();
  });
});
