/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/immobiliare.js';

/**
 * Immobiliare.it, Italy's largest property portal and the first provider Fredy ships for Italy.
 *
 * The portal answers a town search with a server rendered page and a map search with a payload
 * from its own endpoint, so both shapes run through the same assertions here: what is pinned is
 * that either one arrives as the same normalized listing. A renamed class name is harmless, a
 * renamed field is not.
 *
 * Assertions are structural rather than literal, because the same file runs against the fixtures
 * (`yarn test:offline`) and against the live portal (`yarn test`), where every advert differs.
 */
const TEST_TIMEOUT = 120_000;

/** The two search shapes the provider reads, each with the source config a job would carry. */
const searchShapes = [
  { shape: 'town search', source: providerConfig.immobiliare },
  { shape: 'map search', source: { url: providerConfig.immobiliare.mapSearchUrl, enabled: true } },
];

describe.each(searchShapes)('#immobiliare provider testsuite() - $shape', ({ shape, source }) => {
  /** @type {any[]} */
  let listings;

  beforeAll(async () => {
    const Fredy = await mockFredy();
    const runConfig = provider.createConfig(source, [], []);
    // Both shapes are answered by the same endpoint and so by the same fixture. Deduplication is
    // per job, so they have to run as two jobs or the second one finds nothing new.
    const job = { id: `immobiliare-${shape}`, notificationAdapter: null, spatialFilter: null, specFilter: null };

    const fredy = new Fredy(runConfig, job, provider.metaInformation.id, similarityCache, undefined);
    listings = await fredy.execute();
  }, TEST_TIMEOUT);

  /**
   * Every portal carries adverts that leave a figure out - a price on request, a garage with no
   * rooms - and a live run will meet one sooner or later. What is pinned is that the figures that
   * are there are readable, not that every advert has them all.
   *
   * @param {string} field
   * @returns {any[]} the listings carrying that field
   */
  const carrying = (field) => {
    const found = listings.filter((listing) => listing[field] != null);
    expect(found.length, `no listing carried a ${field}`).toBeGreaterThan(0);
    return found;
  };

  it('finds listings', () => {
    expect(listings).toBeInstanceOf(Array);
    expect(listings.length).toBeGreaterThan(0);
  });

  it('reads the headline figures as numbers', () => {
    for (const listing of carrying('price')) {
      expect(typeof listing.price, `price of ${listing.id}`).toBe('number');
      expect(listing.price, `price of ${listing.id}`).toBeGreaterThan(0);
    }
    for (const listing of carrying('size')) {
      expect(listing.size, `size of ${listing.id}`).toBeGreaterThan(0);
    }
    for (const listing of carrying('rooms')) {
      expect(listing.rooms, `rooms of ${listing.id}`).toBeGreaterThan(0);
      // A flat with more rooms than this is the open "5+" band read as something else entirely.
      expect(listing.rooms, `rooms of ${listing.id}`).toBeLessThan(30);
    }
  });

  it('links to the advert rather than to a relative path', () => {
    for (const listing of listings) {
      expect(listing.link, `link of ${listing.id}`).toMatch(/^https:\/\/www\.immobiliare\.it\/annunci\//);
    }
  });

  /**
   * The reason the provider builds the address at all. The payload keeps the street and the town in
   * two separate fields, and "Via Giulia" on its own is a street in half the country. An advert
   * whose owner named no street is still shown - the town alone is the honest address then - but
   * the pair is what the builder exists for, and almost every advert carries it.
   */
  it('names the town alongside the street', () => {
    const joined = carrying('address').filter((listing) => listing.address.includes(','));
    expect(joined.length).toBeGreaterThan(0);
  });

  /**
   * The adverts carry their own coordinates, which is what keeps the pipeline from spending a
   * Nominatim request per listing to arrive at a worse answer.
   */
  it('brings the coordinates with it', () => {
    for (const listing of carrying('latitude')) {
      // Italy's mainland box, which is what the map allows for an Italian provider.
      expect(listing.latitude, `latitude of ${listing.id}`).toBeGreaterThan(35);
      expect(listing.latitude, `latitude of ${listing.id}`).toBeLessThan(48);
      expect(listing.longitude, `longitude of ${listing.id}`).toBeGreaterThan(6);
      expect(listing.longitude, `longitude of ${listing.id}`).toBeLessThan(19);
    }
  });
});

describe('#immobiliare provider configuration()', () => {
  /**
   * `dataModifica` is the criterion the portal sorted by until it stopped honouring it; it is now
   * accepted and ignored, and a search sent with it comes back with the paid placements first.
   */
  it('sorts by the publication date the search backend still honours', () => {
    expect(provider.config.sortByDateParam).toBe('criterio=data&ordine=desc');
  });

  /**
   * The search endpoints answer no dates at all; the android app's property detail carries both the
   * creation and the last edit, in epoch seconds. The later of the two is what the list orders by -
   * a re-published advert is the portal's own notion of "newer".
   */
  it('reads the date the advert carries off the app api, seconds turned into milliseconds', async () => {
    const originalFetch = globalThis.fetch;
    let askedUrl = null;
    globalThis.fetch = async (url) => {
      askedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 117393751, creationDate: 1736789140, lastModified: 1788187900 }),
      };
    };

    try {
      const listing = await provider.config.fetchDetails({
        link: 'https://www.immobiliare.it/annunci/117393751/',
      });

      expect(askedUrl).toBe('https://android-imm-v4.ws-app.com/b2c/v2/properties/117393751');
      expect(listing.publishedAt).toBe(1788187900000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps the listing without a date when the app api answers nothing', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });

    try {
      const listing = await provider.config.fetchDetails({
        link: 'https://www.immobiliare.it/annunci/117393751/',
      });

      expect(listing.publishedAt).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  /**
   * The search endpoints answer an advert without its description, so the app api - already asked
   * for the date - is where the text comes from. A search read from the rendered page carries the
   * text itself, and the api's word must not overwrite it.
   */
  it('fills in the description the search payload does not carry', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 117393751,
        creationDate: 1736789140,
        description: { reference: 'EK-117393751', content: '  Appartamento luminoso a due passi dal centro.  ' },
      }),
    });

    try {
      const listing = await provider.config.fetchDetails({
        link: 'https://www.immobiliare.it/annunci/117393751/',
      });

      expect(listing.description).toBe('Appartamento luminoso a due passi dal centro.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps the description a rendered search already carried', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ description: { content: 'Testo dall app api' } }),
    });

    try {
      const listing = await provider.config.fetchDetails({
        link: 'https://www.immobiliare.it/annunci/117393751/',
        description: 'Testo dalla pagina',
      });

      expect(listing.description).toBe('Testo dalla pagina');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('leaves the description alone when the advert carries none', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ description: { reference: 'EK-117393751', content: '   ' } }),
    });

    try {
      const listing = await provider.config.fetchDetails({
        link: 'https://www.immobiliare.it/annunci/117393751/',
        description: null,
      });

      expect(listing.description).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('asks for no date on a listing whose link names no advert id', async () => {
    const originalFetch = globalThis.fetch;
    let asked = false;
    globalThis.fetch = async () => {
      asked = true;
      return { ok: true, status: 200, json: async () => ({}) };
    };

    try {
      const listing = await provider.config.fetchDetails({ link: null });
      expect(asked).toBe(false);
      expect(listing.publishedAt).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('declares Italy, which is what sends the geocoder there', () => {
    expect(provider.metaInformation.countries).toEqual(['it']);
  });

  /**
   * The endpoint answers 500 without `path`, and the whole search has to survive the translation -
   * the polygon and the repeated filter keys included.
   */
  it('carries the map search over to the endpoint, naming the page it came from', () => {
    const endpoint = new URL(
      provider.convertMapSearchToApi(
        'https://www.immobiliare.it/search-list/?idContratto=1&vrt=45.1%2C9.1%3B45.2%2C9.2&idTipologia[]=12&idTipologia[]=13',
      ),
    );

    expect(endpoint.origin + endpoint.pathname).toBe('https://www.immobiliare.it/api-next/search-list/listings/');
    expect(endpoint.searchParams.get('path')).toBe('/search-list/');
    expect(endpoint.searchParams.get('idContratto')).toBe('1');
    expect(endpoint.searchParams.get('vrt')).toBe('45.1,9.1;45.2,9.2');
    expect(endpoint.searchParams.getAll('idTipologia[]')).toEqual(['12', '13']);
  });

  /**
   * The endpoint answers 25 adverts at a time and counts the pages itself, so a search of any size
   * has to be walked rather than read once.
   */
  it('reads every page the endpoint counts', async () => {
    const asked = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const page = Number(new URL(String(url)).searchParams.get('pag'));
      asked.push(page);
      return {
        ok: true,
        status: 200,
        json: async () => ({ maxPages: 3, currentPage: page, results: [{ realEstate: { id: page } }] }),
      };
    };

    // The walk waits between pages, which a real run wants and a test does not.
    vi.useFakeTimers();
    try {
      const runConfig = provider.createConfig({ url: providerConfig.immobiliare.mapSearchUrl }, []);
      const walk = runConfig.getListings(runConfig.url, undefined);
      await vi.runAllTimersAsync();
      const results = await walk;

      expect(asked).toEqual([1, 2, 3]);
      expect(results).toHaveLength(3);
    } finally {
      vi.useRealTimers();
      globalThis.fetch = originalFetch;
    }
  });

  /**
   * A town is named by the path, so the criteria for the pages after the first cannot be lifted off
   * the url. They come from what the rendered page reports having searched for.
   */
  it('reads the search a rendered page ran, which is what its later pages are asked with', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          dehydratedState: {
            queries: [
              {
                queryKey: ['real-estate-list', { idComune: '8042', criterio: 'data' }, '1', false],
                state: { data: { results: [{ realEstate: { id: 1 } }], maxPages: 7 } },
              },
            ],
          },
        },
      },
    })}</script>`;

    expect(provider.parseSearch(html)).toEqual({
      results: [{ realEstate: { id: 1 } }],
      criteria: { idComune: '8042', criterio: 'data' },
      maxPages: 7,
    });
    expect(provider.parseListings(html)).toEqual([{ realEstate: { id: 1 } }]);
  });

  it('carries a town search over to the endpoint, criteria and page both', () => {
    const endpoint = new URL(
      provider.convertTownSearchToApi('https://www.immobiliare.it/vendita-case/milano/?criterio=data', {
        idComune: '8042',
        idContratto: '1',
        criterio: 'data',
        ordine: 'desc',
      }),
    );

    expect(endpoint.origin + endpoint.pathname).toBe('https://www.immobiliare.it/api-next/search-list/listings/');
    expect(endpoint.searchParams.get('path')).toBe('/vendita-case/milano/');
    expect(endpoint.searchParams.get('idComune')).toBe('8042');
    expect(endpoint.searchParams.get('ordine')).toBe('desc');
  });
});
