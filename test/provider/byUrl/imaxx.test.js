/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import puppeteerExtractor from '../../../lib/services/extractor/puppeteerExtractor.js';
import { parse } from '../../../lib/services/extractor/parser/parser.js';
import { buildHash } from '../../../lib/utils.js';
import { config } from '../../../lib/provider/imaxx.js';
import { expectComplete, fixture } from './contract.js';

/**
 * IMAXX's `fetchListingByUrl`, which reads the exposé through the browser. See `contract.js`.
 */

vi.mock('../../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: vi.fn() }));

beforeEach(() => {
  puppeteerExtractor.mockReset();
});

describe('imaxx', () => {
  const EXPOSE = 'https://www.imaxx.de/immobilien/wohnung-eigentumswohnung-etagenwohnung-in-giessen-kaufen-50683/';
  const browser = { name: 'the run browser' };

  /** The same advert as a search run stores it, read off the recorded search page. */
  const fromSearch = () =>
    parse(config.crawlContainer, config.crawlFields, fixture('imaxx.html'))
      .map((card) => config.normalize(card))
      .find((listing) => listing.link === EXPOSE);

  it('reads the exposé into the listing a search run stores', async () => {
    puppeteerExtractor.mockResolvedValue(fixture('imaxx_detail.html'));
    const listing = await config.fetchListingByUrl(EXPOSE, browser);

    expectComplete(listing);
    expect(puppeteerExtractor).toHaveBeenCalledWith(EXPOSE, null, { browser, name: 'imaxx_details' });

    const found = fromSearch();
    expect(found).toBeDefined();
    expect(listing.id).toBe(found.id);
    expect(listing.id).toBe(buildHash('50683', '526.000 EUR'));
    expect(listing.link).toBe(found.link);

    expect(listing).toMatchObject({
      title: found.title,
      price: found.price,
      size: found.size,
      rooms: found.rooms,
      address: found.address,
      buildYear: 1984,
    });
    expect(listing.price).toBe(526000);
    expect(listing.image).toContain('backbonephoto-010_b_hd');
    expect(listing.description).toContain('4-Zimmer-Wohnung');
    expect(Number.isFinite(listing.publishedAt)).toBe(true);
  });

  it('settles on the canonical link whatever the shared one carried', async () => {
    puppeteerExtractor.mockResolvedValue(fixture('imaxx_detail.html'));
    const listing = await config.fetchListingByUrl(`${EXPOSE.slice(0, -1)}?utm_campaign=newsletter#kontakt`, browser);

    expect(listing.link).toBe(EXPOSE);
  });

  it('answers null for a URL that names no exposé, without loading it', async () => {
    for (const url of [
      'https://www.imaxx.de/immobilien/?post_type=immomakler_object&vermarktungsart%5B0%5D=kauf',
      'https://www.imaxx.de/',
      'https://www.imaxx.de/kontakt/',
      'not a url',
    ]) {
      expect(await config.fetchListingByUrl(url, browser)).toBeNull();
    }
    expect(puppeteerExtractor).not.toHaveBeenCalled();
  });

  it('answers null when the page is blocked, is another page, or fails to load', async () => {
    puppeteerExtractor.mockResolvedValue(null);
    expect(await config.fetchListingByUrl(EXPOSE, browser)).toBeNull();

    // Any other page, the search here, has a canonical link that names no exposé.
    puppeteerExtractor.mockResolvedValue(fixture('imaxx.html'));
    expect(await config.fetchListingByUrl(EXPOSE, browser)).toBeNull();

    puppeteerExtractor.mockRejectedValue(new Error('Target closed'));
    expect(await config.fetchListingByUrl(EXPOSE, browser)).toBeNull();
  });
});
