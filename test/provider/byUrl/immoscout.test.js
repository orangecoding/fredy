/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { buildHash } from '../../../lib/utils.js';
import { expectComplete, fixture } from './contract.js';

/**
 * ImmoScout's `fetchListingByUrl`, which reads the mobile API's exposé. See `contract.js`.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('immoscout', () => {
  const EXPOSE = 'https://www.immobilienscout24.de/expose/168963883';

  /** The mobile API, answering every exposé with the recorded one. */
  const stubApi = (
    answer = { ok: true, status: 200, json: async () => JSON.parse(fixture('immoscout_detail.json')) },
  ) => {
    const calls = [];
    vi.stubGlobal('fetch', async (url) => {
      calls.push(String(url));
      return answer;
    });
    return calls;
  };

  it('reads the exposé into the listing a search run stores', async () => {
    const calls = stubApi();
    const { config } = await import('../../../lib/provider/immoscout.js');
    const listing = await config.fetchListingByUrl(EXPOSE);

    expectComplete(listing);
    expect(calls).toEqual(['https://api.mobile.immobilienscout24.de/expose/168963883']);

    // The same advert sits in the recorded search, so the hash a run computes is known exactly.
    const card = JSON.parse(fixture('immoscout_list.json')).resultListItems.find(
      (entry) => entry.item?.id === '168963883',
    );
    const searchPrice = card.item.attributes.find((attribute) => attribute.value.includes('€')).value;
    expect(listing.id).toBe(buildHash('168963883', searchPrice));
    expect(listing.link).toBe(EXPOSE);

    expect(listing).toMatchObject({
      title: 'Loft mit eigenem Garten: 131 m² auf zwei Ebenen, Erstbezug',
      price: 2300,
      size: 131.37,
      rooms: 2,
      address: 'Kölner Straße 223, 40227 Oberbilk, Düsseldorf',
      latitude: 51.21718,
      longitude: 6.80224,
      buildYear: 1950,
    });
    expect(listing.images.length).toBeGreaterThan(0);
    expect(listing.image).toBe(listing.images[0].url);
    expect(listing.description).toContain('Objektbeschreibung');
  });

  it('settles on the canonical link whatever the shared one carried', async () => {
    stubApi();
    const { config } = await import('../../../lib/provider/immoscout.js');
    const listing = await config.fetchListingByUrl(`${EXPOSE}?referrer=taf&utm_source=other#/`);

    expect(listing.link).toBe(EXPOSE);
  });

  it('answers null for a URL that names no exposé, without asking the API', async () => {
    const calls = stubApi();
    const { config } = await import('../../../lib/provider/immoscout.js');

    for (const url of [
      'https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mieten',
      'https://www.immobilienscout24.de/',
      'https://www.immobilienscout24.de/expose/',
      'not a url',
    ]) {
      expect(await config.fetchListingByUrl(url)).toBeNull();
    }
    expect(calls).toEqual([]);
  });

  it('answers null when the API does not know the exposé, or answers garbage', async () => {
    stubApi({ ok: false, status: 404, json: async () => ({}) });
    const { config } = await import('../../../lib/provider/immoscout.js');
    expect(await config.fetchListingByUrl(EXPOSE)).toBeNull();

    stubApi({ ok: true, status: 200, json: async () => ({ sections: [] }) });
    expect(await config.fetchListingByUrl(EXPOSE)).toBeNull();

    stubApi({ ok: true, status: 200, json: async () => Promise.reject(new SyntaxError('not json')) });
    expect(await config.fetchListingByUrl(EXPOSE)).toBeNull();
  });

  it('recognises a new-build project page by its path, which holds no single advert', async () => {
    const { config } = await import('../../../lib/provider/immoscout.js');

    expect(
      config.isProjectUrl(
        'https://www.immobilienscout24.de/neubau/mk-immobilien-gmbh/wohnanlage-berlin-lichtenrade/152187.html',
      ),
    ).toBe(true);
    expect(config.isProjectUrl(EXPOSE)).toBe(false);
    expect(config.isProjectUrl('https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mieten')).toBe(false);
    expect(config.isProjectUrl('not a url')).toBe(false);
  });

  it('is not offered on the Austrian site, whose exposé ids the API does not know', async () => {
    const { config } = await import('../../../lib/provider/immoscoutAt.js');
    expect(config.fetchListingByUrl).toBeUndefined();
  });
});
