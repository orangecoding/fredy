/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { config, createConfig, metaInformation, parseSearchPage } from '../../lib/provider/domiporta.js';

const URL = 'https://www.domiporta.pl/dom/sprzedam/malopolskie/krakow';
const advert = {
  '@type': ['Product', 'RealEstateListing'],
  name: 'Przestronny dom 280 m² z garażem i ogrodem w Nowej Hucie: Kraków Nowa Huta: ul. Stare Wiślisko',
  description: 'Dom szeregowy narożny w stanie deweloperskim, 5 sypialni.',
  image: 'https://galeria.domiporta.pl/pictures/big/14/e3/74/dom.jpg',
  datePosted: '2025-05-14',
  url: 'https://www.domiporta.pl/nieruchomosci/sprzedam-dom-krakow-nowa-huta-ul-stare-wislisko-280m2/155818899',
  offers: {
    '@type': 'Offer',
    price: 2175000,
    priceCurrency: 'PLN',
    itemOffered: {
      '@type': 'Accommodation',
      numberOfRooms: 6,
      floorSize: { '@type': 'QuantitativeValue', value: 280 },
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Kraków',
        addressRegion: 'małopolskie',
        streetAddress: 'ul. Stare Wiślisko',
        addressCountry: 'PL',
      },
    },
  },
};
const withUnit = (id, overrides = {}) => ({
  ...advert,
  name: 'Nowe mieszkanie dwupokojowe: Kraków Bronowice: Gabrieli Zapolskiej 21',
  url: `https://www.domiporta.pl/nowe/ogloszenie/tertio_zapolskiej_krakow-bronowice_${id}`,
  ...overrides,
});
const withId = (id, overrides = {}) => ({
  ...advert,
  url: `https://www.domiporta.pl/nieruchomosci/sprzedam-dom-krakow/${id}`,
  ...overrides,
});
const pageHtml = (items, nextPage = null) => {
  const list = items.length
    ? `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebPage' },
          { '@type': 'ItemList', itemListElement: items.map((item, index) => ({ position: index + 1, item })) },
        ],
      })}</script>`
    : '';
  const link = nextPage ? `<a href="/dom/sprzedam/malopolskie/krakow?PageNumber=${nextPage}">${nextPage}</a>` : '';
  return `<body class="listing-page">${list}<div class="listing__container">${link}</div></body>`;
};
const response = (items, nextPage = null) => ({ ok: true, text: async () => pageHtml(items, nextPage) });
afterEach(() => vi.unstubAllGlobals());

describe('Domiporta search page', () => {
  it('reads real recorded pages and distinguishes a valid empty result', async () => {
    for (const file of ['domiporta.html', 'domiporta_page2.html']) {
      const parsed = parseSearchPage(
        await readFile(new globalThis.URL(`../testFixtures/${file}`, import.meta.url), 'utf8'),
      );
      expect(parsed.items.length).toBeGreaterThan(0);
      expect(parsed.linkedPages.includes(2)).toBe(file === 'domiporta.html');
      for (const item of parsed.items) {
        const listing = config.normalize(item);
        expect(listing.link).toMatch(
          /^https:\/\/www.domiporta.pl\/(?:nieruchomosci\/[\w-]+\/\d+|nowe\/ogloszenie\/[\w-]+_\d+)$/,
        );
        expect(listing.currency).toBe('PLN');
        expect(listing.publishedAt).toBeTypeOf('number');
      }
    }
    expect(parseSearchPage(pageHtml([])).items).toEqual([]);
  });

  it.each([
    '',
    '<html>403 ERROR</html>',
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'ItemList', itemListElement: 'none' })}</script>`,
    // A list whose entries are no Domiporta adverts is a changed page, not a search with nothing new.
    `<script type="application/ld+json">${JSON.stringify({
      '@type': 'ItemList',
      itemListElement: [{ item: { url: 'https://elsewhere.example/oferta/1' } }],
    })}</script>`,
  ])('rejects a missing or changed page: %s', (html) =>
    expect(() => parseSearchPage(html)).toThrow(/valid search page/),
  );

  it("reads the advert off the page's schema.org listing", () => {
    const listing = config.normalize(advert);
    expect(listing).toMatchObject({
      // Domiporta appends the place to the headline; the district in it belongs to the address.
      title: 'Przestronny dom 280 m² z garażem i ogrodem w Nowej Hucie',
      link: 'https://www.domiporta.pl/nieruchomosci/sprzedam-dom-krakow-nowa-huta-ul-stare-wislisko-280m2/155818899',
      price: 2175000,
      currency: 'PLN',
      size: 280,
      rooms: 6,
      address: 'ul. Stare Wiślisko, Kraków Nowa Huta, małopolskie',
      description: 'Dom szeregowy narożny w stanie deweloperskim, 5 sypialni.',
      // Midnight in Poland, which is summer time in May.
      publishedAt: Date.UTC(2025, 4, 13, 22),
      image: 'https://galeria.domiporta.pl/pictures/big/14/e3/74/dom.jpg',
    });
    // A new asking price is the same advert, not a new listing.
    expect(config.normalize({ ...advert, offers: { ...advert.offers, price: 1990000 } }).id).toBe(listing.id);
    expect(config.normalize({ ...advert, name: 'Dom: z ogrodem' }).title).toBe('Dom: z ogrodem');
    expect(config.normalize({ ...advert, offers: { ...advert.offers, price: null } }).price).toBeNull();
    expect(config.normalize({ ...advert, offers: { price: 1 } })).toMatchObject({
      size: null,
      rooms: null,
      address: null,
    });
    expect(config.normalize({ ...advert, datePosted: '2025-02-30' }).publishedAt).toBeUndefined();
    expect(config.normalize({ ...advert, description: 'Dom&nbsp;z ogrodem &amp;\n garażem' }).description).toBe(
      'Dom z ogrodem & garażem',
    );
    expect(config.normalize({ ...advert, url: 'https://evil.example/nieruchomosci/x/1' }).link).toBeNull();
    expect(config.normalize({ ...advert, image: 'http://plain.example/a.jpg' }).image).toBeNull();
  });

  it('moves the place out of the title and into the address, with or without a street', () => {
    const withoutStreet = (name) =>
      config.normalize({
        ...advert,
        name,
        offers: {
          ...advert.offers,
          itemOffered: {
            ...advert.offers.itemOffered,
            address: { addressLocality: 'Kraków', addressRegion: 'małopolskie' },
          },
        },
      });
    expect(withoutStreet('Dom na sprzedaż: Kraków Zwierzyniec Wola Justowska')).toMatchObject({
      title: 'Dom na sprzedaż',
      address: 'Kraków Zwierzyniec Wola Justowska, małopolskie',
    });
    // A colon in the headline itself stays.
    expect(withoutStreet('Dom: 5 pokoi: Kraków Podgórze')).toMatchObject({
      title: 'Dom: 5 pokoi',
      address: 'Kraków Podgórze, małopolskie',
    });
    expect(withoutStreet('Mieszkanie: Kraków Podgórze Duchackie Podgórze Duchackie').address).toBe(
      'Kraków Podgórze Duchackie, małopolskie',
    );
  });

  it("keeps a development's flats, numbered apart from the adverts", () => {
    const unit = withUnit(668256);
    const listing = config.normalize(unit);
    expect(listing.link).toBe('https://www.domiporta.pl/nowe/ogloszenie/tertio_zapolskiej_krakow-bronowice_668256');
    expect(listing.id).not.toBe(config.normalize(withId(668256)).id);
    expect(config.normalize({ ...unit, url: 'https://www.domiporta.pl/nowe/inwestycje/x' }).link).toBeNull();
  });

  it('keeps URLs and blacklists isolated between simultaneous configurations', () => {
    const first = createConfig({ url: URL }, ['garaż']);
    const second = createConfig({ url: `${URL}?Price.To=2000000` }, []);
    expect(first).not.toBe(second);
    expect(first.url).toBe(URL);
    expect(first.filter({ title: 'Dom garaż' })).toBe(false);
    expect(second.filter({ title: 'Dom garaż' })).toBe(true);
    expect(config.url).toBeNull();
    expect(config.filter).toBeUndefined();
    expect(metaInformation).toMatchObject({ id: 'domiporta', countries: ['pl'], currency: 'PLN' });
  });
});

describe('Domiporta retrieval', () => {
  it('starts at page one, keeps filters, sorts newest first, deduplicates and skips other currencies', async () => {
    const euro = withId(4, { offers: { ...advert.offers, priceCurrency: 'EUR' } });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([advert, withId(2)], 2))
      .mockResolvedValueOnce(response([advert, euro, withId(3)]));
    vi.stubGlobal('fetch', fetch);
    const items = await config.getListings(
      'https://domiporta.pl/dom/sprzedam/malopolskie/krakow?PageNumber=7&SortingOrderDirection=PriceAscending&Price.To=2500000',
    );
    expect(items.map((item) => item.url)).toEqual([advert.url, withId(2).url, withId(3).url]);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [index, [input, options]] of fetch.mock.calls.entries()) {
      const url = new globalThis.URL(input);
      expect(url.hostname).toBe('www.domiporta.pl');
      expect(url.searchParams.get('PageNumber')).toBe(String(index + 1));
      expect(url.searchParams.get('SortingOrderDirection')).toBe('InsertionDateDescending');
      expect(url.searchParams.get('Price.To')).toBe('2500000');
      expect(options.redirect).toBe('manual');
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('keeps paging past a page of development flats', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([advert, withUnit(1)], 2))
      .mockResolvedValueOnce(response([withUnit(2), withUnit(3)], 3))
      .mockResolvedValueOnce(response([withId(4)]));
    vi.stubGlobal('fetch', fetch);
    expect(await config.getListings(URL)).toHaveLength(5);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('keeps what it read when a later page redirects, but not when the first one does', async () => {
    const moved = {
      ok: false,
      status: 301,
      statusText: 'Moved',
      headers: new Headers({ location: `${URL}?PageNumber=1` }),
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([advert], 2))
      .mockResolvedValueOnce(moved);
    vi.stubGlobal('fetch', fetch);
    expect(await config.getListings(URL)).toHaveLength(1);
    fetch.mockReset().mockResolvedValue(moved);
    await expect(config.getListings(URL)).rejects.toThrow(
      /Domiporta redirected the search to https:\/\/www.domiporta.pl/,
    );
  });

  it('stops at the five-page cap', async () => {
    const fetch = vi.fn().mockImplementation(async (url) => {
      const page = Number(new globalThis.URL(url).searchParams.get('PageNumber'));
      return response([withId(page)], page + 1);
    });
    vi.stubGlobal('fetch', fetch);
    expect(await config.getListings(URL)).toHaveLength(5);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('stops when a page repeats, contains no adverts, or links no next page', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([advert], 2))
      .mockResolvedValueOnce(response([advert], 3));
    vi.stubGlobal('fetch', fetch);
    expect(await config.getListings(URL)).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockReset().mockResolvedValue(response([], 2));
    expect(await config.getListings(URL)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockReset().mockResolvedValue(response([advert]));
    expect(await config.getListings(URL)).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fails the entire retrieval on a later-page HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response([advert], 2))
        .mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' }),
    );
    await expect(config.getListings(URL)).rejects.toThrow('Domiporta search failed: 403 Forbidden');
  });

  it.each([
    'https://evil.example/dom/sprzedam/malopolskie/krakow',
    'http://www.domiporta.pl/dom/sprzedam/malopolskie/krakow',
    'https://www.domiporta.pl/dzialka/sprzedam/malopolskie/krakow',
    'https://www.domiporta.pl/nowe/inwestycje?CategoryName=mieszkania',
  ])('refuses unsupported URLs: %s', async (url) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(config.getListings(url)).rejects.toThrow(/flat and house searches/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
