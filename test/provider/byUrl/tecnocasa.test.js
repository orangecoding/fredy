/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { readComponentData } from '../../../lib/services/tecnocasa/network.js';
import { expectComplete, fixture } from './contract.js';

/**
 * `fetchListingByUrl` of the Tecnocasa group's two brands, which share one implementation in
 * `lib/services/tecnocasa/network.js` and read an advert's `:estate` record with a plain request.
 * See `contract.js`.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Every request answered with `answer`, by default the recorded advert page. */
const stubFetch = (answer) => {
  const calls = [];
  vi.stubGlobal('fetch', async (url) => {
    calls.push(String(url));
    return answer;
  });
  return calls;
};

const page = (html) => ({ ok: true, status: 200, statusText: 'OK', text: async () => html });

describe.each([
  {
    brand: 'tecnocasa',
    advert: 'https://www.tecnocasa.it/vendita/appartamenti/roma/roma/61254153.html',
    search: 'https://www.tecnocasa.it/annunci/immobili/lazio/roma/roma.html',
    expected: {
      title: 'Trilocale in vendita',
      price: 170000,
      size: 75,
      rooms: 3,
      address: 'Via casal  bordino, Roma',
      latitude: 41.9117,
      longitude: 12.6133,
      buildYear: 1935,
      energyClass: 'G',
    },
  },
  {
    brand: 'tecnorete',
    advert: 'https://www.tecnorete.it/vendita/ville/brescia/erbusco/61228917.html',
    search: 'https://www.tecnorete.it/annunci/immobili/lombardia/brescia/erbusco.html',
    expected: {
      title: 'Villa singola in vendita',
      price: 499000,
      size: 650,
      rooms: 4,
      address: 'Via Iseo, Erbusco',
      latitude: 45.5862,
      longitude: 10.0033,
      buildYear: 1970,
      energyClass: 'G',
    },
  },
])('$brand', ({ brand, advert, search, expected }) => {
  const load = () => import(`../../../lib/provider/${brand}.js`);

  it('reads the advert into the listing a search run stores', async () => {
    const calls = stubFetch(page(fixture(`${brand}_detail.html`)));
    const { config } = await load();
    const listing = await config.fetchListingByUrl(advert);

    expectComplete(listing);
    expect(calls).toEqual([advert]);

    // The same advert sits in the recorded search, so what a run stores is known exactly.
    const advertId = Number(advert.match(/(\d+)\.html$/)[1]);
    const card = readComponentData(fixture(`${brand}.html`), ':estates').find((estate) => estate.id === advertId);
    const fromSearch = config.normalize(card);
    expect(listing.id).toBe(fromSearch.id);
    expect(listing.link).toBe(fromSearch.link);
    expect(listing.link).toBe(advert);
    expect(listing.image).toBe(fromSearch.image);

    expect(listing).toMatchObject(expected);
    expect(listing.images.length).toBeGreaterThan(1);
    expect(listing.images[0].url).toBe(listing.image);
    expect(typeof listing.description).toBe('string');
    expect(listing.description.length).toBeGreaterThan(0);
    expect(typeof listing.publishedAt).toBe('number');
  });

  it('settles on the canonical link whatever the shared one carried', async () => {
    const calls = stubFetch(page(fixture(`${brand}_detail.html`)));
    const { config } = await load();
    const listing = await config.fetchListingByUrl(`${advert}?utm_source=facebook&fbclid=abc#mappa`);

    expect(listing.link).toBe(advert);
    expect(calls).toEqual([advert]);
  });

  it('answers null for a URL that names no advert, without a request', async () => {
    const calls = stubFetch(page(fixture(`${brand}_detail.html`)));
    const { config } = await load();

    for (const url of [search, `${search}/pag-2`, new URL(advert).origin + '/', 'not a url']) {
      expect(await config.fetchListingByUrl(url)).toBeNull();
    }
    expect(calls).toEqual([]);
  });

  it('answers null when the page is gone, carries no advert, or the request fails', async () => {
    const { config } = await load();

    stubFetch({ ok: false, status: 404, statusText: 'Not Found', text: async () => '' });
    expect(await config.fetchListingByUrl(advert)).toBeNull();

    // A page of the platform that carries adverts, but not the `:estate` of one.
    stubFetch(page(fixture(`${brand}.html`)));
    expect(await config.fetchListingByUrl(advert)).toBeNull();

    stubFetch(page('<html><body></body></html>'));
    expect(await config.fetchListingByUrl(advert)).toBeNull();

    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });
    expect(await config.fetchListingByUrl(advert)).toBeNull();
  });

  it('needs no browser', async () => {
    const { config } = await load();
    expect(config.needsBrowser).toBe(false);
  });
});
