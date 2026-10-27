/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import puppeteerExtractor from '../../../lib/services/extractor/puppeteerExtractor.js';
import { parse } from '../../../lib/services/extractor/parser/parser.js';
import { buildHash } from '../../../lib/utils.js';
import { config } from '../../../lib/provider/wgGesucht.js';
import { expectComplete, fixture } from './contract.js';

/**
 * WG-Gesucht's `fetchListingByUrl`, which reads the advert's page through the browser. See
 * `contract.js`.
 */

vi.mock('../../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: vi.fn() }));

beforeEach(() => {
  puppeteerExtractor.mockReset();
});

describe('wgGesucht', () => {
  const AD = 'https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf-Oberbilk.14245211.html';
  const browser = { name: 'the run browser' };

  /** The same advert as a search run stores it, read off the recorded search page. */
  const fromSearch = () =>
    parse(config.crawlContainer, config.crawlFields, fixture('wgGesucht.html'))
      .map((card) => config.normalize(card))
      .find((listing) => listing.link === AD);

  it('reads the advert into the listing a search run stores', async () => {
    puppeteerExtractor.mockResolvedValue(fixture('wgGesucht_detail.html'));
    const listing = await config.fetchListingByUrl(AD, browser);

    expectComplete(listing);
    expect(puppeteerExtractor).toHaveBeenCalledWith(AD, null, { browser, name: 'wgGesucht_details' });

    // The list spells the rent "620 €" and the exposé's key fact "620€"; the hash is the list's.
    const found = fromSearch();
    expect(found).toBeDefined();
    expect(listing.id).toBe(found.id);
    expect(listing.id).toBe(buildHash('14245211', '620 €'));
    expect(listing.link).toBe(found.link);

    expect(listing).toMatchObject({
      title: found.title,
      price: 620,
      size: 15,
      rooms: 2,
      image: found.image,
      address: 'Ellerstraße 40227 Düsseldorf Oberbilk',
    });
  });

  it('spells the rent the way the list does when the page has no map', async () => {
    const withoutMap = fixture('wgGesucht_detail.html').replace('id="map_marker_info_14245211"', 'id="elsewhere"');
    puppeteerExtractor.mockResolvedValue(withoutMap);
    const listing = await config.fetchListingByUrl(AD, browser);

    expect(listing.id).toBe(buildHash('14245211', '620 €'));
    expect(listing.price).toBe(620);
  });

  it('settles on the canonical link whatever the shared one carried', async () => {
    puppeteerExtractor.mockResolvedValue(fixture('wgGesucht_detail.html'));
    const listing = await config.fetchListingByUrl(`${AD}?pagination=1&pu=#mapContainer`, browser);

    expect(listing.link).toBe(AD);
    expect(puppeteerExtractor.mock.calls[0][0]).toBe(AD);
  });

  it('answers null for a URL that names no advert, without loading it', async () => {
    for (const url of [
      'https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf.30.0.1.0.html',
      'https://www.wg-gesucht.de/',
      'https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf.html',
      'not a url',
    ]) {
      expect(await config.fetchListingByUrl(url, browser)).toBeNull();
    }
    expect(puppeteerExtractor).not.toHaveBeenCalled();
  });

  it('answers null when the page is blocked, is another page, or fails to load', async () => {
    puppeteerExtractor.mockResolvedValue(null);
    expect(await config.fetchListingByUrl(AD, browser)).toBeNull();

    // Any other page, the search here, has a canonical link that names no advert.
    puppeteerExtractor.mockResolvedValue(fixture('wgGesucht.html'));
    expect(await config.fetchListingByUrl(AD, browser)).toBeNull();

    puppeteerExtractor.mockRejectedValue(new Error('Target closed'));
    expect(await config.fetchListingByUrl(AD, browser)).toBeNull();
  });
});
