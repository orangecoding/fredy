/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readCategory } from '../../lib/services/immobiliare/web-paths.js';
import { clearPlaceCache, resolvePlace, toQuery } from '../../lib/services/immobiliare/geography.js';
import { translateSearchUrl } from '../../lib/services/immobiliare/web-translator.js';

/**
 * A town search on immobiliare.it names its town in words and the search endpoint wants the number
 * the portal calls it by. Looking that number up is what lets a town search be asked for over
 * plain http, where it used to need a browser and a bot wall, so what these tests pin is the
 * reading of the url and the reading of the answer - not the service itself, which is mocked.
 *
 * `reverse-engineered-immobiliare.md` records where each of these facts was measured.
 */

/** One answer of the geography service, as it comes back for `erbusco`. */
const ERBUSCO = [
  {
    id: '7369',
    type: 2,
    label: 'Erbusco',
    parents: [
      { id: 'BS', type: 1, label: 'Brescia' },
      { id: 'lom', type: 0, label: 'Lombardia' },
      { id: 'IT', type: -1, label: 'Italia' },
    ],
  },
];

/** What the service answers for `citta-studi`, whose label qualifies it with another place. */
const CITTA_STUDI = [
  {
    id: '10070',
    type: 3,
    label: 'Città Studi, Susa',
    parents: [
      { id: '8042', type: 2, label: 'Milano' },
      { id: 'MI', type: 1, label: 'Milano' },
      { id: 'lom', type: 0, label: 'Lombardia' },
      { id: 'IT', type: -1, label: 'Italia' },
    ],
  },
];

/**
 * The service ranks by relevance, so a query answers with places of every level and the wrong one
 * often ranks first. "Brescia" is a province, the city in it, and a quarter of a town in Rimini.
 */
const BRESCIA = [
  { id: '50124', type: 3, label: 'Brescia', parents: [{ id: '7967', type: 2, label: 'San Giovanni in Marignano' }] },
  { id: '7329', type: 2, label: 'Brescia', parents: [{ id: 'BS', type: 1, label: 'Brescia' }] },
  { id: 'BS', type: 1, label: 'Brescia', parents: [{ id: 'lom', type: 0, label: 'Lombardia' }] },
];

/**
 * @param {Record<string, any[]>} byQuery What to answer for each query.
 * @returns {any} a fetch replacement
 */
function serve(byQuery) {
  return vi.fn(async (url) => {
    const asked = new URL(String(url)).searchParams.get('query') ?? '';
    const found = byQuery[asked];
    if (found == null) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => found };
  });
}

describe('the place a search url names', () => {
  /** @type {any} */
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    clearPlaceCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('asks for the place in the words the url spells it with', () => {
    expect(toQuery('citta-studi')).toBe('citta studi');
    expect(toQuery('erbusco')).toBe('erbusco');
  });

  it('names the place and every place above it, which is what the endpoint filters by', async () => {
    globalThis.fetch = serve({ erbusco: ERBUSCO });

    expect(await resolvePlace(['erbusco'])).toEqual({
      idNazione: 'IT',
      fkRegione: 'lom',
      idProvincia: 'BS',
      idComune: '7369',
    });
  });

  /**
   * A quarter is named by two segments because its own name does not identify it - there is a
   * Città Studi in Milan and another one elsewhere - so the town is asked for alongside it.
   */
  it('reads a quarter as a quarter of the town the url names', async () => {
    globalThis.fetch = serve({ 'citta studi milano': CITTA_STUDI });
    const place = await resolvePlace(['milano', 'citta-studi']);

    expect(place).toMatchObject({ idComune: '8042', 'idMZona[]': '10070' });
  });

  /**
   * The url's grammar says which level is meant, and it has to: taking the best ranked answer would
   * read `/vendita-case/brescia/` as a quarter of a town in Rimini.
   */
  it('takes the level the url asks for rather than the best ranked answer', async () => {
    globalThis.fetch = serve({ brescia: BRESCIA });

    expect(await resolvePlace(['brescia'])).toMatchObject({ idComune: '7329' });
    clearPlaceCache();
    // The website spells a whole province this way, and means every town in it.
    expect(await resolvePlace(['brescia-provincia'])).toEqual({ fkRegione: 'lom', idProvincia: 'BS' });
  });

  it('has no answer for a place the service does not know', async () => {
    globalThis.fetch = serve({});
    expect(await resolvePlace(['nowhere-at-all'])).toBeNull();
    expect(await resolvePlace([])).toBeNull();
  });

  /**
   * A town keeps its id, so a resolved lookup is remembered for the lifetime of the process. That
   * makes "no such place" and "the service could not be read just now" two different answers, and
   * they used to be the same one: a 503 remembered as the former sent every run of every job
   * searching that town back through the browser and its bot wall, until Fredy was restarted.
   */
  it('asks again after a failure, and answers once the service is back', async () => {
    let asked = 0;
    globalThis.fetch = vi.fn(async () => {
      asked += 1;
      return asked === 1
        ? { ok: false, status: 503, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ERBUSCO };
    });

    expect(await resolvePlace(['erbusco'])).toBeNull();
    expect(await resolvePlace(['erbusco'])).toMatchObject({ idComune: '7369' });
    expect(asked).toBe(2);
  });

  it('asks once for a place the service says it does not have', async () => {
    const fetcher = serve({});
    globalThis.fetch = fetcher;

    expect(await resolvePlace(['nowhere-at-all'])).toBeNull();
    expect(await resolvePlace(['nowhere-at-all'])).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('the search a website url describes', () => {
  it('reads what is on offer and on what terms', () => {
    expect(readCategory('vendita-case')).toEqual({ idContratto: '1', idCategoria: '1' });
    expect(readCategory('affitto-case')).toEqual({ idContratto: '2', idCategoria: '1' });
    expect(readCategory('vendita-ville')).toEqual({ idContratto: '1', idCategoria: '1', 'idTipologia[]': '12' });
    expect(readCategory('affitto-case-indipendenti')).toEqual({
      idContratto: '2',
      idCategoria: '1',
      'idTipologia[]': '7',
    });
    // Offices are their own category rather than a kind of home, and 23 rather than the 2 that
    // reads as commercial - which answers with houses.
    expect(readCategory('vendita-uffici')).toEqual({ idContratto: '1', idCategoria: '23' });
    expect(readCategory('affitto-stanze')).toEqual({ idContratto: '2', idCategoria: '4' });
    expect(readCategory('case')).toBeNull();
    expect(readCategory('vendita-astronavi')).toBeNull();
  });

  describe('read whole', () => {
    /** @type {any} */
    let originalFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      clearPlaceCache();
      globalThis.fetch = serve({ erbusco: ERBUSCO });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('carries the filters over untouched, which is what makes an unknown one harmless', async () => {
      const criteria = await translateSearchUrl(
        'https://www.immobiliare.it/vendita-case/erbusco/?prezzoMassimo=300000&qualcosaDiNuovo=1',
      );

      expect(criteria).toContainEqual(['prezzoMassimo', '300000']);
      expect(criteria).toContainEqual(['qualcosaDiNuovo', '1']);
      expect(criteria).toContainEqual(['idComune', '7369']);
    });

    /**
     * The website says several things under one name. An object would keep the last of them, and a
     * search for two kinds of house would quietly become a search for the second.
     */
    it('keeps every value of a filter the url repeats', async () => {
      const criteria = await translateSearchUrl(
        'https://www.immobiliare.it/vendita-case/erbusco/?idTipologia%5B%5D=12&idTipologia%5B%5D=13',
      );

      expect(criteria?.filter(([name]) => name === 'idTipologia[]')).toEqual([
        ['idTipologia[]', '12'],
        ['idTipologia[]', '13'],
      ]);
    });

    it('drops the page, which belongs to the request rather than to the search', async () => {
      const criteria = await translateSearchUrl('https://www.immobiliare.it/vendita-case/erbusco/?pag=4');
      expect(criteria?.some(([name]) => name === 'pag')).toBe(false);
    });

    /**
     * The pipeline appends the sort to the url so that the search carries it, so it travels with
     * the other filters rather than being dropped as a per-request setting.
     */
    it('keeps the sort the pipeline asked for', async () => {
      const criteria = await translateSearchUrl(
        'https://www.immobiliare.it/vendita-case/erbusco/?criterio=data&ordine=desc',
      );

      expect(criteria).toContainEqual(['criterio', 'data']);
      expect(criteria).toContainEqual(['ordine', 'desc']);
    });

    it('gives up on a url it cannot read whole, so the caller renders it instead', async () => {
      expect(await translateSearchUrl('https://www.immobiliare.it/vendita-astronavi/erbusco/')).toBeNull();
      expect(await translateSearchUrl('https://www.immobiliare.it/vendita-case/')).toBeNull();
      expect(await translateSearchUrl('not a url')).toBeNull();
    });
  });
});
