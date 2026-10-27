/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { expectComplete, fixture } from './contract.js';

/**
 * Engel & Völkers' `fetchListingByUrl`, which reads the exposé's Next.js payload off the rendered
 * page. See `contract.js`.
 */

const extractor = vi.hoisted(() => ({ page: vi.fn() }));
vi.mock('../../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: extractor.page }));

const { config, createConfig, parseListings } = await import('../../../lib/provider/engelVoelkers.js');

const EXPOSE = 'https://www.engelvoelkers.com/de/de/exposes/6eca04ed-8da1-51f1-95da-776acaec8933';
const SEARCH =
  'https://www.engelvoelkers.com/de/de/propertysearch?businessArea%5B%5D=residential&placeIds%5B%5D=ChIJ8_KccStOqEcRhtFXjKWPuo0&propertyMarketingType%5B%5D=sale';
const browser = { name: 'the caller’s browser' };

beforeEach(() => {
  extractor.page.mockReset();
  extractor.page.mockResolvedValue(fixture('engelVoelkers_detail.html'));
});

describe('engelVoelkers', () => {
  it('reads the exposé into the listing a search run stores', async () => {
    const listing = await config.fetchListingByUrl(EXPOSE, browser);

    expectComplete(listing);
    expect(extractor.page).toHaveBeenCalledTimes(1);
    expect(extractor.page).toHaveBeenCalledWith(EXPOSE, 'body', expect.objectContaining({ browser }));

    // The same advert sits in the recorded search, so what a run stores is known exactly.
    const card = parseListings(fixture('engelVoelkers.html')).find(
      (entry) => entry.id === '6eca04ed-8da1-51f1-95da-776acaec8933',
    );
    const fromSearch = createConfig({ url: SEARCH }).normalize(card);
    expect(listing.id).toBe(fromSearch.id);
    expect(listing.link).toBe(fromSearch.link);
    expect(listing.link).toBe(EXPOSE);
    expect(listing.image).toBe(fromSearch.image);

    expect(listing).toMatchObject({
      title: 'Ein Statement für Lebenskunst und Luxus',
      price: 24900000,
      size: 1170,
      address: 'Dahlem, Berlin, Deutschland',
      energyClass: 'D',
      latitude: 52.454962235143704,
      longitude: 13.284036049212068,
    });
    expect(listing.publishedAt).toBe(Date.parse('2026-02-23T13:41:40.066475Z'));
    expect(listing.images).toHaveLength(10);
    expect(listing.images[0].url).toBe(listing.image);
    expect(listing.description.length).toBeGreaterThan(card.profile.title.length);
  });

  it('settles on the canonical link whatever the shared one carried', async () => {
    const listing = await config.fetchListingByUrl(`${EXPOSE}/?utm_source=share&utm_medium=whatsapp#gallery`, browser);

    expect(listing.link).toBe(EXPOSE);
    expect(extractor.page).toHaveBeenCalledWith(EXPOSE, 'body', expect.anything());
  });

  it('keeps the locale of the shop the exposé was shared from', async () => {
    const english = EXPOSE.replace('/de/de/', '/de/en/');
    const listing = await config.fetchListingByUrl(english, browser);

    expect(listing.link).toBe(english);
  });

  it('answers null for a URL that names no exposé, without loading a page', async () => {
    for (const url of [
      SEARCH,
      'https://www.engelvoelkers.com/',
      'https://www.engelvoelkers.com/de/de/exposes/',
      'https://www.engelvoelkers.com/de/de/immobilien/res/kaufen/haus/berlin',
      'not a url',
    ]) {
      expect(await config.fetchListingByUrl(url, browser)).toBeNull();
    }
    expect(extractor.page).not.toHaveBeenCalled();
  });

  it('answers null when the page is blocked, empty or breaks', async () => {
    extractor.page.mockResolvedValue(null);
    expect(await config.fetchListingByUrl(EXPOSE, browser)).toBeNull();

    extractor.page.mockResolvedValue('<html><body><h1>Seite nicht gefunden</h1></body></html>');
    expect(await config.fetchListingByUrl(EXPOSE, browser)).toBeNull();

    extractor.page.mockResolvedValue('<script id="__NEXT_DATA__">{"props":{}}</script>');
    expect(await config.fetchListingByUrl(EXPOSE, browser)).toBeNull();

    extractor.page.mockRejectedValue(new Error('browser went away'));
    expect(await config.fetchListingByUrl(EXPOSE, browser)).toBeNull();
  });
});
