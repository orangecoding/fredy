/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  config,
  createConfig,
  fetchGratkaPage,
  metaInformation,
  parseSearchPage,
  unflatten,
} from '../../lib/provider/gratka.js';

const URL = 'https://gratka.pl/nieruchomosci/domy/krakow';

/** Serialise plain data as Nuxt's devalue does: one flat array, values referenced by index. */
const flatten = (root) => {
  const values = [];
  const add = (value) => {
    const index = values.length;
    values.push(null);
    if (value === null || typeof value !== 'object') values[index] = value;
    else if (Array.isArray(value)) values[index] = value.map(add);
    else values[index] = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, add(item)]));
    return index;
  };
  add(root);
  return values;
};
const pageHtml = (nodes, page = 1, pages = 1, perPage = 35) =>
  `<script type="application/json" id="__NUXT_DATA__">${JSON.stringify(
    flatten({
      data: {
        'decode-listing-url-query-/nieruchomosci/domy/krakow': {
          data: { decodeListingUrl: { listingParameters: { pageNumber: page, numberOfResults: perPage } } },
        },
        'property-listing-data-/nieruchomosci/domy/krakow-offers': {
          data: { searchResult: { properties: { nodes, totalCount: pages * perPage } } },
        },
      },
    }),
  )}</script>`;
const photo = (url) => ({ id: Buffer.from(url).toString('base64') });
const advert = {
  id: 1543086372,
  title: 'dom na sprzedaż',
  advertisementText: 'Bez skosów, 3 sypialnie, basen. Skotnicka.',
  url: '/nieruchomosci/dom-krakow-debniki-ksiedza-franciszka-trockiego/ob/49146287',
  price: { amount: '1598000.00', currency: 'PLN' },
  area: '123',
  numberOfRooms: '4 pokoje',
  location: { location: ['małopolskie', 'Kraków', 'Dębniki', 'Skotniki'], street: 'Księdza Franciszka Trockiego' },
  description: 'Dom, w którym chce się mieszkać.',
  addedAt: '2026-10-01',
  development: null,
  photos: [photo('https://d-gr.cdngr.pl/kadry/k/r/gr-ogl/55/57/49146287_1.jpg')],
};
const response = (nodes, page = 1, pages = 1) => ({
  ok: true,
  status: 200,
  text: async () => pageHtml(nodes, page, pages),
});
afterEach(() => vi.unstubAllGlobals());

describe('Gratka search payload', () => {
  it('reads recorded pages, root wrapper included', async () => {
    for (const file of ['gratka.html', 'gratka_page2.html']) {
      const parsed = parseSearchPage(
        await readFile(new globalThis.URL(`../testFixtures/${file}`, import.meta.url), 'utf8'),
      );
      expect(parsed.items.length).toBeGreaterThan(0);
      expect(parsed.pagination.totalPages).toBe(2);
      for (const item of parsed.items) {
        const listing = config.normalize(item);
        expect(listing.link).toMatch(/^https:\/\/gratka.pl\/nieruchomosci\/[\w-]+\/o[bi]\/\d+$/);
        expect(listing.currency).toBe('PLN');
        expect(listing.publishedAt).toBeTypeOf('number');
      }
    }
    expect(parseSearchPage(pageHtml([])).items).toEqual([]);
  });

  it.each([
    '',
    '<html>403 ERROR</html>',
    '<script id="__NUXT_DATA__">{</script>',
    `<script id="__NUXT_DATA__">${JSON.stringify(flatten({ data: {} }))}</script>`,
  ])('rejects a missing or changed payload: %s', (html) =>
    expect(() => parseSearchPage(html)).toThrow(/valid search payload/),
  );

  it("unwraps devalue's tagged values without evaluating anything", () => {
    // root -> {a: Reactive([1, 2]), b: Date, c: null-prototype object, d: undefined, e: shared ref}
    const values = [
      { a: 1, b: 4, c: 5, d: -1, e: 7, f: 7 },
      ['Reactive', 2],
      [3, 3],
      'x',
      ['Date', '2026-10-01T00:00:00.000Z'],
      ['null', 'k', 6],
      'v',
      { same: 3 },
    ];
    const root = unflatten(values);
    expect(root).toEqual({
      a: ['x', 'x'],
      b: '2026-10-01T00:00:00.000Z',
      c: { k: 'v' },
      d: undefined,
      e: { same: 'x' },
      f: { same: 'x' },
    });
    expect(root.e).toBe(root.f);
    expect(unflatten([['Unknown', 5]])).toBeUndefined();
  });

  it('keeps numeric values, Polish addresses, dates, pictures and canonical links', () => {
    const listing = config.normalize(advert);
    expect(listing).toMatchObject({
      title: 'Bez skosów, 3 sypialnie, basen. Skotnicka.',
      price: 1598000,
      currency: 'PLN',
      size: 123,
      rooms: 4,
      address: 'Księdza Franciszka Trockiego, Kraków, małopolskie',
      link: 'https://gratka.pl/nieruchomosci/dom-krakow-debniki-ksiedza-franciszka-trockiego/ob/49146287',
      // Midnight in Poland, which is summer time on the first of October.
      publishedAt: Date.UTC(2026, 8, 30, 22),
      image: 'https://d-gr.cdngr.pl/kadry/k/r/gr-ogl/55/57/49146287_1.jpg',
    });
    // A new asking price is the same advert, not a new listing.
    expect(config.normalize({ ...advert, price: { amount: '1500000.00', currency: 'PLN' } }).id).toBe(listing.id);
    expect(config.normalize({ ...advert, advertisementText: '' }).title).toBe('Dom na sprzedaż');
    expect(config.normalize({ ...advert, numberOfRooms: 'więcej niż 9 pokoi' }).rooms).toBe(10);
    expect(config.normalize({ ...advert, numberOfRooms: '1 pokój' }).rooms).toBe(1);
    expect(config.normalize({ ...advert, numberOfRooms: '' }).rooms).toBeNull();
    expect(config.normalize({ ...advert, location: { ...advert.location, street: null } }).address).toBe(
      'Skotniki, Kraków, małopolskie',
    );
    expect(config.normalize({ ...advert, location: null }).address).toBeNull();
    expect(config.normalize({ ...advert, url: '/nieruchomosci/dom-krakow/oi/49291877' }).link).toBe(
      'https://gratka.pl/nieruchomosci/dom-krakow/oi/49291877',
    );
    expect(config.normalize({ ...advert, url: '//evil.example/ob/1' }).link).toBeNull();
    expect(config.normalize({ ...advert, addedAt: '2026-02-30' }).publishedAt).toBeUndefined();
    expect(
      config.normalize({ ...advert, photos: [{ id: Buffer.from('http://plain.example/a.jpg').toString('base64') }] })
        .image,
    ).toBeNull();
  });

  it('names the village and municipality outside cities with county rights, not the county', () => {
    const at = (location, street = null) => config.normalize({ ...advert, location: { location, street } }).address;
    expect(at(['małopolskie', 'krakowski', 'Skawina', 'Zelczyna'], 'Lawendowa')).toBe(
      'Lawendowa, Zelczyna, Skawina, małopolskie',
    );
    expect(at(['małopolskie', 'wielicki', 'Niepołomice', 'Niepołomice'], 'Aleja Dębowa')).toBe(
      'Aleja Dębowa, Niepołomice, małopolskie',
    );
    expect(at(['małopolskie', 'wielicki', 'Wieliczka'])).toBe('Wieliczka, małopolskie');
    expect(at(['małopolskie', 'Kraków', 'Dębniki'])).toBe('Dębniki, Kraków, małopolskie');
  });

  it('recovers the exact living space the card rounds down', () => {
    const sized = (area, amount, perSquareMetre) =>
      config.normalize({
        ...advert,
        area,
        price: { amount, currency: 'PLN' },
        priceM2: { amount: perSquareMetre, currency: 'PLN' },
      }).size;
    expect(sized('108', '1450000.00', '13388.73')).toBe(108.3);
    expect(sized('34', '650000.00', '18597.99')).toBe(34.95);
    // A price per square metre that does not fit the card's area is not trusted.
    expect(sized('108', '1450000.00', '5000.00')).toBe(108);
    expect(sized('108', null, '13388.73')).toBe(108);
  });

  it('keeps URLs and blacklists isolated between simultaneous configurations', () => {
    const first = createConfig({ url: URL }, ['basen']);
    const second = createConfig({ url: `${URL}?cena-calkowita:max=2000000` }, []);
    expect(first).not.toBe(second);
    expect(first.url).toBe(URL);
    expect(first.filter({ title: 'Dom z basenem' })).toBe(false);
    expect(second.filter({ title: 'Dom z basenem' })).toBe(true);
    expect(config.url).toBeNull();
    expect(config.filter).toBeUndefined();
    expect(metaInformation).toMatchObject({ id: 'gratka', countries: ['pl'], currency: 'PLN' });
  });
});

describe('Gratka retrieval', () => {
  it('starts at page one, preserves filters and sorts, deduplicates, and omits developments and other currencies', async () => {
    const development = { ...advert, id: 2, price: null, development: { id: 9 } };
    const euro = { ...advert, id: 4, price: { amount: '250000.00', currency: 'EUR' } };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([advert, development], 1, 2))
      .mockResolvedValueOnce(response([advert, euro, { ...advert, id: 3, price: null }], 2, 2));
    vi.stubGlobal('fetch', fetch);
    const items = await config.getListings(`${URL}?page=9&sort=cheap&cena-calkowita:max=2000000`);
    expect(items.map((item) => item.id)).toEqual([advert.id, 3]);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [index, [input, options]] of fetch.mock.calls.entries()) {
      const url = new globalThis.URL(input);
      // Gratka answers an explicit first page with 404.
      expect(url.searchParams.get('page')).toBe(index === 0 ? null : String(index + 1));
      expect(url.searchParams.get('cena-calkowita:max')).toBe('2000000');
      expect(url.searchParams.get('sort')).toBe('newest');
      expect(options.redirect).toBe('manual');
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('accepts the www host and normalizes it before fetching', async () => {
    const fetch = vi.fn().mockResolvedValue(response([advert]));
    vi.stubGlobal('fetch', fetch);
    await config.getListings('https://www.gratka.pl/nieruchomosci/mieszkania/krakow');
    expect(new globalThis.URL(fetch.mock.calls[0][0]).hostname).toBe('gratka.pl');
  });

  it.each([
    [
      'SEO path canonicalisation',
      'https://gratka.pl/nieruchomosci/mieszkania/krakow/wynajem?cena-calkowita:max=3000&sort=newest',
      '/nieruchomosci/mieszkania/do-3000/krakow/wynajem?cena-calkowita%3Amax=3000&sort=newest',
    ],
    [
      'filter canonicalisation',
      'https://gratka.pl/nieruchomosci/mieszkania/krakow?rynek=wtorny&sort=newest',
      '/nieruchomosci/mieszkania/krakow?sort=newest',
    ],
  ])(
    'follows Gratka %s redirects and carries the canonical URL to the next page',
    async (_label, source, canonicalPath) => {
      const canonical = `https://gratka.pl${canonicalPath}`;
      const fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 302,
          statusText: 'Found',
          headers: new Headers({ location: canonical }),
        })
        .mockResolvedValueOnce(response([advert], 1, 2))
        .mockResolvedValueOnce(response([{ ...advert, id: 3 }], 2, 2));
      vi.stubGlobal('fetch', fetch);
      const items = await config.getListings(source);
      expect(items).toHaveLength(2);
      expect(fetch).toHaveBeenCalledTimes(3);
      const firstRequest = new globalThis.URL(source);
      firstRequest.searchParams.set('sort', 'newest');
      firstRequest.searchParams.delete('page');
      const secondPage = new globalThis.URL(canonical);
      secondPage.searchParams.set('page', '2');
      expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
        firstRequest.toString(),
        canonical,
        secondPage.toString(),
      ]);
      expect(fetch.mock.calls.every(([, options]) => options.redirect === 'manual')).toBe(true);
    },
  );

  it.each([
    'http://gratka.pl/nieruchomosci/domy/krakow',
    'https://evil.example/nieruchomosci/domy/krakow',
    'https://127.0.0.1/nieruchomosci/domy/krakow',
  ])('rejects redirects outside HTTPS Gratka hosts: %s', async (location) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 302,
        statusText: 'Found',
        headers: new Headers({ location }),
      }),
    );
    await expect(fetchGratkaPage(URL)).rejects.toThrow(/unsupported URL/);
  });

  it('keeps what it read when a later page is gone, but not when the first one is', async () => {
    const gone = { ok: false, status: 404, statusText: 'Not Found' };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([advert], 1, 2))
      .mockResolvedValueOnce(gone);
    vi.stubGlobal('fetch', fetch);
    expect((await config.getListings(URL)).map((item) => item.id)).toEqual([advert.id]);
    fetch.mockReset().mockResolvedValue(gone);
    await expect(config.getListings(URL)).rejects.toThrow('Gratka search failed: 404 Not Found');
  });

  it('stops at the five-page cap', async () => {
    const fetch = vi.fn().mockImplementation(async (url) => {
      const page = Number(new globalThis.URL(url).searchParams.get('page') ?? '1');
      return response([{ ...advert, id: page }], page, 99);
    });
    vi.stubGlobal('fetch', fetch);
    expect(await config.getListings(URL)).toHaveLength(5);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('stops when a page repeats or contains no adverts', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([advert], 1, 99))
      .mockResolvedValueOnce(response([advert], 2, 99));
    vi.stubGlobal('fetch', fetch);
    expect(await config.getListings(URL)).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockReset().mockResolvedValue(response([], 1, 0));
    expect(await config.getListings(URL)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fails the entire retrieval on a later-page HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response([advert], 1, 2))
        .mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' }),
    );
    await expect(config.getListings(URL)).rejects.toThrow('Gratka search failed: 403 Forbidden');
  });

  it('rejects incorrect pagination instead of walking the same page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([advert], 3, 5)));
    await expect(config.getListings(URL)).rejects.toThrow('Gratka returned page 3 instead of 1.');
  });

  it.each([
    'https://evil.example/nieruchomosci/domy/krakow',
    'http://gratka.pl/nieruchomosci/domy/krakow',
    'https://gratka.pl/nieruchomosci/dzialki/krakow',
  ])('refuses unsupported URLs: %s', async (url) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(config.getListings(url)).rejects.toThrow(/flat and house searches/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
