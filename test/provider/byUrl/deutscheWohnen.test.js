/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { expectComplete, fixture } from './contract.js';

/**
 * Deutsche Wohnen's `fetchListingByUrl`, which reads the `data-vonovia-data` record off the rendered
 * offer page. See `contract.js`.
 */

const extractor = vi.hoisted(() => ({ page: vi.fn() }));
vi.mock('../../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: extractor.page }));

const { config, convertWebToApi } = await import('../../../lib/provider/deutscheWohnen.js');

const OFFER = 'https://www.deutsche-wohnen.com/mieten/mietangebote/25-zimmer-wohnung-im-gruenen-89-1442140005';
const SEARCH = 'https://www.deutsche-wohnen.com/mieten/mietangebote?rentType=miete&city=Berlin&immoType=wohnung';
const browser = { name: 'the caller’s browser' };

/**
 * The listing a search run normalizes for this offer, out of the recorded API answer. Run through
 * the provider's own `getListings`, so the row is built exactly as a run builds it.
 */
async function fromSearch() {
  vi.stubGlobal('fetch', async (url) =>
    String(url).includes('search-token')
      ? { ok: true, status: 200, json: async () => ({ token: 'recorded' }) }
      : { ok: true, status: 200, json: async () => JSON.parse(fixture('deutscheWohnen_list.json')) },
  );
  const rows = await config.getListings(convertWebToApi(SEARCH));
  return config.normalize(rows.find((row) => row.id === '1442140005'));
}

beforeEach(() => {
  extractor.page.mockReset();
  extractor.page.mockResolvedValue(fixture('deutscheWohnen_detail.html'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deutscheWohnen', () => {
  it('reads the offer into the listing a search run stores', async () => {
    const listing = await config.fetchListingByUrl(OFFER, browser);

    expectComplete(listing);
    expect(extractor.page).toHaveBeenCalledTimes(1);
    expect(extractor.page).toHaveBeenCalledWith(OFFER, 'body', expect.objectContaining({ browser }));

    // The same offer sits in the recorded search, so what a run stores is known exactly.
    const searched = await fromSearch();
    expect(listing.id).toBe(searched.id);
    expect(listing.link).toBe(searched.link);
    expect(listing.link).toBe(OFFER);

    expect(listing).toMatchObject({
      title: '2,5-Zimmer Wohnung im Grünen',
      price: 692,
      size: 59.51,
      rooms: 2.5,
      address: 'Spanische Allee 125, 14129 Berlin OT Zehlendorf',
      latitude: 52.4339944,
      longitude: 13.2115225,
      buildYear: 1930,
      energyClass: 'F',
    });
    // The gallery in the same rendition a search run stores, campaign banner and all left out.
    expect(listing.images).toEqual(searched.images);
    expect(listing.images.length).toBeGreaterThan(0);
    expect(listing.description).toContain('Beschreibung');
  });

  it('settles on the canonical link whatever the shared one carried', async () => {
    const listing = await config.fetchListingByUrl(
      `${OFFER}/?utm_source=immowelt&utm_campaign=share#grundriss`,
      browser,
    );

    expect(listing.link).toBe(OFFER);
    expect(extractor.page).toHaveBeenCalledWith(OFFER, 'body', expect.anything());
  });

  it('answers null for a URL that names no offer, without loading a page', async () => {
    for (const url of [
      SEARCH,
      'https://www.deutsche-wohnen.com/',
      'https://www.deutsche-wohnen.com/mieten/mietangebote/',
      'https://www.deutsche-wohnen.com/api/deuwo-real-estate/list?city=Berlin',
      'not a url',
    ]) {
      expect(await config.fetchListingByUrl(url, browser)).toBeNull();
    }
    expect(extractor.page).not.toHaveBeenCalled();
  });

  it('answers null when the page is blocked, empty, no rental or breaks', async () => {
    extractor.page.mockResolvedValue(null);
    expect(await config.fetchListingByUrl(OFFER, browser)).toBeNull();

    extractor.page.mockResolvedValue('<html><body><h1>Seite nicht gefunden</h1></body></html>');
    expect(await config.fetchListingByUrl(OFFER, browser)).toBeNull();

    extractor.page.mockResolvedValue(`<div data-vonovia-data='{"heading":"Ohne Kennung"}'></div>`);
    expect(await config.fetchListingByUrl(OFFER, browser)).toBeNull();

    extractor.page.mockResolvedValue(
      `<div data-vonovia-data='{"objectId":"1","heading":"Eigentumswohnung","isPropertyForSale":true}'></div>`,
    );
    expect(await config.fetchListingByUrl(OFFER, browser)).toBeNull();

    extractor.page.mockResolvedValue(`<div data-vonovia-data='{not json'></div>`);
    expect(await config.fetchListingByUrl(OFFER, browser)).toBeNull();

    extractor.page.mockRejectedValue(new Error('browser went away'));
    expect(await config.fetchListingByUrl(OFFER, browser)).toBeNull();
  });
});
