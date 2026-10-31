/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { config, createConfig, metaInformation, parseSearchPage } from '../../lib/provider/otodom.js';

const URL = 'https://www.otodom.pl/pl/wyniki/sprzedaz/dom/malopolskie/krakow/krakow/krakow?ownerTypeSingleSelect=ALL';
const pageHtml = (items, page = 1, pages = 1) =>
  `<script id="__NEXT_DATA__">${JSON.stringify({
    props: { pageProps: { data: { searchAds: { items, pagination: { currentPage: page, totalPages: pages } } } } },
  })}</script>`;
const advert = {
  id: 68229614,
  title: 'Dom w Prusach',
  slug: 'dom-w-prusach-ID4ChDE',
  totalPrice: { value: 1050000, currency: 'PLN' },
  areaInSquareMeters: 97.18,
  roomsNumber: 'FOUR',
  dateCreated: '2026-07-20T18:26:07Z',
  location: {
    address: { street: { name: 'ul. Stary Gościniec', number: null }, city: null },
    reverseGeocoding: {
      locations: [
        { locationLevel: 'voivodeship', name: 'małopolskie' },
        { locationLevel: 'city_or_village', name: 'Prusy' },
      ],
    },
  },
};
const response = (items, page = 1, pages = 1) => ({ ok: true, text: async () => pageHtml(items, page, pages) });
afterEach(() => vi.unstubAllGlobals());

describe('Otodom search payload', () => {
  it('reads real recorded pages and distinguishes a valid empty result', async () => {
    for (const file of ['otodom.html', 'otodom_page2.html']) {
      const parsed = parseSearchPage(
        await readFile(new globalThis.URL(`../testFixtures/${file}`, import.meta.url), 'utf8'),
      );
      expect(parsed.items.length).toBeGreaterThan(0);
      expect(parsed.pagination.totalPages).toBe(2);
      for (const item of parsed.items) {
        const listing = config.normalize(item);
        expect(listing.link).toMatch(/^https:\/\/www.otodom.pl\/pl\/oferta\//);
        expect(listing.currency).toBe('PLN');
      }
    }
    expect(parseSearchPage(pageHtml([])).items).toEqual([]);
  });

  it.each(['', '<html>403 ERROR</html>', '<script id="__NEXT_DATA__">{</script>', pageHtml(null)])(
    'rejects a missing or changed payload: %s',
    (html) => expect(() => parseSearchPage(html)).toThrow(/valid search payload/),
  );

  it('keeps numeric values, Polish addresses, dates, and canonical links', () => {
    const listing = config.normalize(advert);
    expect(listing).toMatchObject({
      price: 1050000,
      currency: 'PLN',
      size: 97.18,
      rooms: 4,
      address: 'ul. Stary Gościniec, Prusy, małopolskie',
      link: 'https://www.otodom.pl/pl/oferta/dom-w-prusach-ID4ChDE',
      publishedAt: Date.parse(advert.dateCreated),
    });
    expect(config.normalize(advert).id).toBe(listing.id);
    expect(config.normalize({ ...advert, totalPrice: { value: 1000000, currency: 'PLN' } }).id).not.toBe(listing.id);
    expect(config.normalize({ ...advert, hidePrice: true }).price).toBeNull();
    expect(config.normalize({ ...advert, roomsNumber: 'MORE' }).rooms).toBeNull();
    expect(config.normalize({ ...advert, location: null }).address).toBeNull();
    expect(config.normalize({ ...advert, slug: '//evil.example' }).link).toBeNull();
    expect(() => config.normalize({ ...advert, totalPrice: { value: 10, currency: 'EUR' } })).toThrow(/currency/);
  });

  it('keeps URLs and blacklists isolated between simultaneous configurations', () => {
    const first = createConfig({ url: URL }, ['prusy']);
    const second = createConfig({ url: `${URL}&priceMax=2000000` }, []);
    expect(first).not.toBe(second);
    expect(first.url).toBe(URL);
    expect(first.filter({ title: 'Dom Prusy' })).toBe(false);
    expect(second.filter({ title: 'Dom Prusy' })).toBe(true);
    expect(config.url).toBeNull();
    expect(config.filter).toBeUndefined();
    expect(metaInformation).toMatchObject({ id: 'otodom', countries: ['pl'], currency: 'PLN' });
  });
});

describe('Otodom retrieval', () => {
  it('starts at page one, preserves filters and sorts, deduplicates, and omits development ranges', async () => {
    const development = { ...advert, id: 2, slug: 'investment-ID2', totalPrice: null, investmentUnitsNumber: 5 };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([advert, development], 1, 2))
      .mockResolvedValueOnce(response([advert, { ...advert, id: 3, slug: 'on-request-ID3', totalPrice: null }], 2, 2));
    vi.stubGlobal('fetch', fetch);
    const items = await config.getListings(`${URL}&page=9&by=PRICE&priceMax=2000000`);
    expect(items.map((item) => item.id)).toEqual([advert.id, 3]);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [index, [input, options]] of fetch.mock.calls.entries()) {
      const url = new globalThis.URL(input);
      expect(url.searchParams.get('page')).toBe(String(index + 1));
      expect(url.searchParams.get('ownerTypeSingleSelect')).toBe('ALL');
      expect(url.searchParams.get('priceMax')).toBe('2000000');
      expect(url.searchParams.get('by')).toBe('LATEST');
      expect(url.searchParams.get('direction')).toBe('DESC');
      expect(options.redirect).toBe('error');
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('stops at the five-page cap', async () => {
    const fetch = vi.fn().mockImplementation(async (url) => {
      const page = Number(new globalThis.URL(url).searchParams.get('page'));
      return response([{ ...advert, id: page, slug: `dom-ID${page}` }], page, 99);
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
    await expect(config.getListings(URL)).rejects.toThrow('Otodom search failed: 403 Forbidden');
  });

  it('rejects incorrect pagination instead of walking the same page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([advert], 3, 5)));
    await expect(config.getListings(URL)).rejects.toThrow('Otodom returned page 3 instead of 1.');
  });

  it.each([
    'https://evil.example/pl/wyniki/sprzedaz/dom/krakow',
    'http://www.otodom.pl/pl/wyniki/sprzedaz/dom/krakow',
    'https://www.otodom.pl/pl/wyniki/wynajem/mieszkanie/krakow',
  ])('refuses unsupported URLs: %s', async (url) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(config.getListings(url)).rejects.toThrow(/house-sale searches/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
