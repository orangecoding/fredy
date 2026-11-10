/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { config, createConfig } from '../../lib/provider/immoscout.js';

/**
 * Regression tests for https://github.com/orangecoding/fredy/issues/519 - house searches dropped
 * every builder offer ("Hausbauangebot"), because only `EXPOSE_RESULT` entries were read.
 *
 * The search answer is stubbed inline, so these never touch the network in either test mode.
 */
const SEARCH_URL = 'https://api.mobile.immobilienscout24.de/search/list?searchType=region&realestatetype=housebuy';

/** One builder offer, shaped like the mobile API's `groupingObjects` entries. */
const builderOffer = (id) => ({
  id,
  title: 'LivingHaus - Dein individuelles Traumhaus',
  address: { line: '16348 Wandlitz, Wandlitz (unvollständige Adresse)', postcode: '16348' },
  titlePicture: { preview: `https://pictures.example/${id}-preview.jpg`, full: `https://pictures.example/${id}.jpg` },
  attributes: [
    { label: '', value: '568.795 €' },
    { label: '', value: '120 m²' },
    { label: '', value: '3 Zi.' },
  ],
});

const searchAnswer = {
  resultListItems: [
    {
      type: 'EXPOSE_RESULT',
      item: {
        id: '100',
        title: 'Einfamilienhaus mit Garten',
        address: { line: '16321 Bernau bei Berlin' },
        attributes: [
          { label: '', value: '450.000 €' },
          { label: '', value: '140 m²' },
          { label: '', value: '5 Zi.' },
        ],
      },
    },
    {
      type: 'NEW_HOME_BUILDER_RESULT',
      item: {
        isNewHomeBuilder: true,
        attributes: [{ label: '', value: 'Bauen mit Living Fertighaus GmbH' }],
        groupingObjectsSectionHeading: '2 passende Hausbauangebote',
        groupingObjects: [builderOffer('201'), builderOffer('202'), { title: 'no id, nothing to link to' }],
      },
    },
    { type: 'SOMETHING_ELSE', item: { id: '300' } },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => searchAnswer }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('immoscout builder offers', () => {
  it('returns every builder offer next to the ordinary adverts', async () => {
    const listings = await config.getListings(SEARCH_URL);

    expect(listings.map((listing) => listing.id)).toEqual(['100', '201', '202']);
  });

  it('reads a builder offer like any other search card', async () => {
    const listings = await config.getListings(SEARCH_URL);
    const offer = config.normalize(listings.find((listing) => listing.id === '201'));

    expect(offer).toMatchObject({
      link: 'https://www.immobilienscout24.de/expose/201',
      title: 'LivingHaus - Dein individuelles Traumhaus',
      price: 568795,
      size: 120,
      rooms: 3,
      address: '16348 Wandlitz, Wandlitz',
      image: 'https://pictures.example/201.jpg',
      description: 'Bauen mit Living Fertighaus GmbH',
    });
  });

  it('gives an ordinary advert no description before its exposé is read', async () => {
    const [advert] = await config.getListings(SEARCH_URL);

    expect(config.normalize(advert).description).toBeUndefined();
  });

  it('lets the blacklist leave builder offers out', async () => {
    const run = createConfig(
      { url: 'https://www.immobilienscout24.de/Suche/de/brandenburg/barnim-kreis/haus-kaufen' },
      ['Bauen mit'],
    );
    const listings = (await run.getListings(SEARCH_URL)).map((listing) => run.normalize(listing));

    expect(listings.filter(run.filter).map((listing) => listing.link)).toEqual([
      'https://www.immobilienscout24.de/expose/100',
    ]);
  });

  it('copes with an answer that carries no result list', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => ({}) }));

    expect(await config.getListings(SEARCH_URL)).toEqual([]);
  });
});
