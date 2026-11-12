/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { config } from '../../lib/provider/immoscout.js';

/**
 * A listing's title is the advertiser's own text. The old web scraper had to cut the site's "NEU"
 * badge out of the title element it read; the mobile API sends no such badge (newness is a field
 * of its own), so cutting "NEU" out of the text only mangled real titles such as "NEUBAU".
 *
 * The search answer is stubbed inline, so these never touch the network in either test mode.
 */
const SEARCH_URL =
  'https://api.mobile.immobilienscout24.de/search/list?geocodes=%2Fde%2Fhessen%2Fwiesbaden&realestatetype=apartmentbuy&searchType=region';

const advert = (id, title) => ({
  type: 'EXPOSE_RESULT',
  item: {
    id,
    title,
    address: { line: '65183 Wiesbaden' },
    attributes: [
      { label: '', value: '650.000 €' },
      { label: '', value: '90 m²' },
      { label: '', value: '3 Zi.' },
    ],
  },
});

const TITLES = {
  1: 'PROVISIONSFREI! *Paul & Partner*EXKLUSIVER NEUBAU-ERSTBEZUG MIT TERRASSE! WE3',
  2: 'NEUE Dachgeschosswohnung mit Blick über Wiesbaden',
  3: 'NEU *Paul & Partner* PRESTIGE TRIFFT EXKLUSIVITÄT!',
};

beforeEach(() => {
  const resultListItems = Object.entries(TITLES).map(([id, title]) => advert(id, title));
  vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => ({ resultListItems }) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('immoscout listing title', () => {
  it('keeps the title exactly as the advertiser wrote it', async () => {
    const listings = (await config.getListings(SEARCH_URL)).map((listing) => config.normalize(listing));

    expect(listings.map((listing) => listing.title)).toEqual(Object.values(TITLES));
  });
});
