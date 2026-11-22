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

  // Seen live on 2026-11-22: a visitor in Gratka's grouping experiment gets `propertyGroups` instead of
  // `properties`, every page of the search. The units after a group's first come as stubs, and only a
  // preview of them (4 of 16 for one development), so the group's full first card is what is read.
  it('reads the first card of every group when Gratka groups the search', () => {
    const unit = { ...advert, id: 1541758756, url: '/nieruchomosci/dom-gdansk-matarnia-telewizyjna/ob/45639759' };
    const stub = { id: 1541758757, url: '/nieruchomosci/dom-gdansk-matarnia-telewizyjna/ob/45639761', area: '90' };
    const html = `<script type="application/json" id="__NUXT_DATA__">${JSON.stringify(
      flatten({
        data: {
          'decode-listing-url-query-/nieruchomosci/domy/krakow?sort=newest': {
            data: { decodeListingUrl: { listingParameters: { pageNumber: 1, numberOfResults: 35 } } },
          },
          'property-listing-data-/nieruchomosci/domy/krakow?sort=newest-groups': {
            data: {
              searchResult: {
                propertyGroups: {
                  nodes: [
                    { total: 1, development: null, primary: advert, secondary: [] },
                    { total: 16, development: { name: 'Innova' }, primary: unit, secondary: [stub] },
                  ],
                  totalCount: 564,
                  offersCount: 596,
                },
              },
            },
          },
        },
      }),
    )}</script>`;
    const parsed = parseSearchPage(html);
    expect(parsed.items.map((item) => item.id)).toEqual([advert.id, unit.id]);
    expect(parsed.pagination).toEqual({ currentPage: 1, totalPages: 17 });
  });

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
  it('reads page one first, preserving filters and sorts, deduplicating, and omitting developments and other currencies', async () => {
    const development = { ...advert, id: 2, price: null, development: { id: 9 } };
    const euro = { ...advert, id: 4, price: { amount: '250000.00', currency: 'EUR' } };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([advert, development, advert, euro, { ...advert, id: 3, price: null }], 1, 2));
    vi.stubGlobal('fetch', fetch);
    // A page number copied into the saved URL does not decide where a run starts.
    const items = await config.getListings(config.pageUrl(`${URL}?page=9&sort=cheap&cena-calkowita:max=2000000`, 1));
    expect(items.map((item) => item.id)).toEqual([advert.id, 3]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, options] = fetch.mock.calls[0];
    const url = new globalThis.URL(input);
    // Gratka answers an explicit first page with 404.
    expect(url.searchParams.get('page')).toBeNull();
    expect(url.searchParams.get('cena-calkowita:max')).toBe('2000000');
    expect(url.searchParams.get('sort')).toBe('newest');
    expect(options.redirect).toBe('manual');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  // A request without the cookie is put in a random experiment bucket, grouped or flat. Runs that
  // disagree reach back to different adverts, and the older ones at the far end would be reported new.
  it('presents one Gratka visitor on every page and every run', async () => {
    const fetch = vi.fn().mockImplementation(async (input) => {
      const page = Number(new globalThis.URL(input).searchParams.get('page') ?? 1);
      return response([{ ...advert, id: page }], page, 2);
    });
    vi.stubGlobal('fetch', fetch);
    await config.getListings(URL);
    await config.getListings(config.pageUrl(URL, 2));
    await config.getListings(URL);
    expect(fetch).toHaveBeenCalledTimes(3);
    const cookies = fetch.mock.calls.map(([, options]) => options.headers.Cookie);
    expect(cookies[0]).toMatch(/^gbuuid_v2=[0-9a-f-]{36}$/);
    expect(new Set(cookies).size).toBe(1);
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
  ])('follows Gratka %s redirects, keeping the page asked for', async (_label, source, canonicalPath) => {
    const canonical = new globalThis.URL(`https://gratka.pl${canonicalPath}`);
    canonical.searchParams.set('page', '2');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 302,
        statusText: 'Found',
        headers: new Headers({ location: canonical.toString() }),
      })
      .mockResolvedValueOnce(response([{ ...advert, id: 3 }], 2, 2));
    vi.stubGlobal('fetch', fetch);
    const items = await config.getListings(config.pageUrl(source, 2));
    expect(items.map((item) => item.id)).toEqual([3]);
    const firstRequest = new globalThis.URL(source);
    firstRequest.searchParams.set('sort', 'newest');
    firstRequest.searchParams.set('page', '2');
    expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([firstRequest.toString(), canonical.toString()]);
    expect(fetch.mock.calls.every(([, options]) => options.redirect === 'manual')).toBe(true);
  });

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

  it('reads a later page that is gone as empty, which ends the walk, but fails on a missing first page', async () => {
    const gone = { ok: false, status: 404, statusText: 'Not Found' };
    const fetch = vi.fn().mockResolvedValue(gone);
    vi.stubGlobal('fetch', fetch);
    expect(await config.getListings(config.pageUrl(URL, 2))).toEqual([]);
    await expect(config.getListings(URL)).rejects.toThrow('Gratka search failed: 404 Not Found');
  });

  it('reads the page pageUrl names, and a page number the search does not have as empty', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response([{ ...advert, id: 7 }], 3, 5));
    vi.stubGlobal('fetch', fetch);
    expect((await config.getListings(config.pageUrl(URL, 3))).map((item) => item.id)).toEqual([7]);
    expect(new globalThis.URL(fetch.mock.calls[0][0]).searchParams.get('page')).toBe('3');
    fetch.mockResolvedValueOnce(response([advert], 5, 5));
    expect(await config.getListings(config.pageUrl(URL, 6))).toEqual([]);
  });

  it('fails on a later-page HTTP failure, which the pipeline turns into the end of the walk', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' }));
    await expect(config.getListings(config.pageUrl(URL, 2))).rejects.toThrow('Gratka search failed: 403 Forbidden');
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
