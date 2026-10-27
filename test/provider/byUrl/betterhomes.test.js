/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { buildHash } from '../../../lib/utils.js';
import { expectComplete, fixture } from './contract.js';

/**
 * BETTERHOMES' `fetchListingByUrl`, which reads the `Object/detail` answer the site's own detail
 * page asks for. See `contract.js`.
 */

vi.mock('../../../lib/services/logger.js', () => ({
  default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { config } = await import('../../../lib/provider/betterhomes.js');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('betterhomes', () => {
  const OBJECT_ID = '7849b687-97b5-30aa-8346-154a2d44447d';
  const ADVERT = `https://www.betterhomes.de/de/immobilie-suchen/detail/objectId/${OBJECT_ID}`;
  // The search the recorded list was taken from, see `test/provider/testProvider.json`.
  const SEARCH =
    'https://www.betterhomes.de/de/immobilie-suchen/kaufen?searchType=buy&objectType=all&zipCity=Bundesland+Berlin&territoryId=3&cityType=3&radius=0&sortOrder=newestDesc';

  /** The endpoint, answering every request with the recorded detail. */
  const stubApi = (
    answer = { ok: true, status: 200, json: async () => JSON.parse(fixture('betterhomes_detail.json')) },
  ) => {
    const calls = [];
    vi.stubGlobal('fetch', async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body), referer: init.headers.Referer });
      return answer;
    });
    return calls;
  };

  it('reads the advert into the listing a search run stores', async () => {
    const calls = stubApi();
    const listing = await config.fetchListingByUrl(ADVERT);

    expectComplete(listing);
    expect(calls).toEqual([
      {
        url: 'https://www.betterhomes.de/apirequest',
        body: {
          action: 'Object/detail',
          method: 'POST',
          data: { id: OBJECT_ID, countryCode: 'DE', languageCode: 'de' },
        },
        referer: ADVERT,
      },
    ]);

    // The same advert sits in the recorded search, so what a run computes for it is known exactly.
    const row = JSON.parse(fixture('betterhomes_list.json')).find((entry) => entry.uniqueKey === OBJECT_ID);
    const searched = config.normalize(row, SEARCH);
    expect(listing.id).toBe(searched.id);
    expect(listing.id).toBe(buildHash(OBJECT_ID, '1100000'));
    expect(listing.link).toBe(searched.link);
    expect(listing.link).toBe(ADVERT);

    expect(listing).toMatchObject({
      title: 'ALTBAU MIT CHARME & MODERNEM KOMFORT',
      price: 1100000,
      size: 145,
      rooms: 4,
      address: '12161 Berlin-Schöneberg',
      buildYear: 1900,
    });
    // The town centre stays out: there is an address to geocode, see `fetchDetails`.
    expect(listing.latitude).toBeUndefined();
    expect(listing.description).toContain('4-Zimmer-Etagenwohnung');
    expect(listing.description).toContain('Südbalkon');
    expect(listing.images).toHaveLength(5);
    expect(listing.image).toBe(listing.images[0].url);
  });

  // The recorded advert is a sale. A rental is priced at its Nettomiete, which the search row spells
  // as a machine number and the detail as display text, and the hash has to come out the same.
  it('hashes a rental the way its search row is hashed', async () => {
    stubApi({
      ok: true,
      status: 200,
      json: async () => ({
        responseCode: 200,
        responseData: {
          id: OBJECT_ID,
          title: 'HELLE WOHNUNG MIT BALKON',
          rental: true,
          priceNet: '1.500 &euro;',
          priceGross: '1.800 &euro;',
          priceGrossFloat: '1800.00',
          priceOnApplication: 'null',
          livingArea: '82',
          rooms: '3',
          address: { city: '10115 Berlin-Mitte' },
        },
      }),
    });
    const listing = await config.fetchListingByUrl(ADVERT);
    const searched = config.normalize(
      {
        uniqueKey: OBJECT_ID,
        rental: 'M',
        priceNet: '1500',
        priceGrossFloat: '1800.00',
        be_obj_preisnachvereinbarung: '0',
      },
      'https://www.betterhomes.de/de/immobilie-suchen/mieten?searchType=rent',
    );

    expect(listing.price).toBe(1500);
    expect(listing.id).toBe(searched.id);
    expect(listing.link).toBe(searched.link);
  });

  it('settles on the canonical link whatever the shared one carried', async () => {
    const calls = stubApi();
    const listing = await config.fetchListingByUrl(
      `https://betterhomes.de/de/immobilie-suchen/detail/objectId/${OBJECT_ID}?utm_source=mail&ref=share#galerie`,
    );

    expect(listing.link).toBe(ADVERT);
    expect(calls[0].referer).toBe(ADVERT);
  });

  it('links to the site and the language the advert was opened on', async () => {
    const calls = stubApi();
    const listing = await config.fetchListingByUrl(
      `https://www.betterhomes.ch/fr/recherche-immobiliere/detail/objectId/${OBJECT_ID}`,
    );

    expect(calls[0].url).toBe('https://www.betterhomes.ch/apirequest');
    expect(calls[0].body.data).toEqual({ id: OBJECT_ID, countryCode: 'CH', languageCode: 'fr' });
    // What a search on that page would link to: the detail page beside it.
    expect(listing.link).toBe(
      config.normalize({ uniqueKey: OBJECT_ID }, 'https://www.betterhomes.ch/fr/recherche-immobiliere/acheter').link,
    );
  });

  it('answers null for a URL that names no advert, without asking the endpoint', async () => {
    const calls = stubApi();

    for (const url of [
      SEARCH,
      'https://www.betterhomes.de/',
      'https://www.betterhomes.de/de/immobilie-suchen/detail/objectId/',
      'https://www.betterhomes.de/de/immobilie-suchen/detail/objectId/not-a-uuid',
      `https://www.betterhomes.de/de/immobilie-suchen/kaufen?objectId/${OBJECT_ID}`,
      `https://www.example.org/de/immobilie-suchen/detail/objectId/${OBJECT_ID}`,
      'not a url',
    ]) {
      expect(await config.fetchListingByUrl(url)).toBeNull();
    }
    expect(calls).toEqual([]);
  });

  it('answers null when the endpoint does not know the advert, refuses, or answers garbage', async () => {
    stubApi({ ok: true, status: 200, json: async () => ({ responseCode: 1000, responseData: null }) });
    expect(await config.fetchListingByUrl(ADVERT)).toBeNull();

    stubApi({ ok: false, status: 429, statusText: 'Too Many Requests', json: async () => ({}) });
    expect(await config.fetchListingByUrl(ADVERT)).toBeNull();

    stubApi({ ok: true, status: 200, json: async () => Promise.reject(new SyntaxError('not json')) });
    expect(await config.fetchListingByUrl(ADVERT)).toBeNull();

    stubApi({
      ok: true,
      status: 200,
      json: async () => ({ responseCode: 200, responseData: { id: OBJECT_ID, title: '  ' } }),
    });
    expect(await config.fetchListingByUrl(ADVERT)).toBeNull();
  });
});
