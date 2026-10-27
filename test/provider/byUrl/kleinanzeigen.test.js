/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import puppeteerExtractor from '../../../lib/services/extractor/puppeteerExtractor.js';
import { parse } from '../../../lib/services/extractor/parser/parser.js';
import { buildHash } from '../../../lib/utils.js';
import { config } from '../../../lib/provider/kleinanzeigen.js';
import { expectComplete, fixture } from './contract.js';

/**
 * Kleinanzeigen's `fetchListingByUrl`, which reads the advert's page through the browser. See
 * `contract.js`.
 */

vi.mock('../../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: vi.fn() }));

beforeEach(() => {
  puppeteerExtractor.mockReset();
});

describe('kleinanzeigen', () => {
  const AD = 'https://www.kleinanzeigen.de/s-anzeige/traumhafte-2-zimmer-wohnung-in-duesseltal-/3471974249-196-2099';
  const browser = { name: 'the run browser' };

  /** The same advert as a search run stores it, read off the recorded search page. */
  const fromSearch = () =>
    parse(config.crawlContainer, config.crawlFields, fixture('kleinanzeigen.html'))
      .map((card) => config.normalize(card))
      .find((listing) => listing.link === AD);

  it('reads the advert into the listing a search run stores', async () => {
    puppeteerExtractor.mockResolvedValue(fixture('kleinanzeigen_detail.html'));
    const listing = await config.fetchListingByUrl(AD, browser);

    expectComplete(listing);
    expect(puppeteerExtractor).toHaveBeenCalledWith(AD, null, { browser, name: 'kleinanzeigen_details' });

    const found = fromSearch();
    expect(found).toBeDefined();
    expect(listing.id).toBe(found.id);
    expect(listing.id).toBe(buildHash('3471974249', '195.000 €'));
    expect(listing.link).toBe(found.link);

    expect(listing).toMatchObject({
      title: found.title,
      price: 195000,
      size: 40,
      rooms: 2,
      address: 'Uhlandstraße 43, 40237 Düsseldorf - Düsseltal',
    });
    expect(listing.image).toContain('2525e2b6-9c77-4007-9896-bcc161d7767a');
    expect(listing.images).toHaveLength(20);
    expect(listing.description).toContain('Düsseltal');
  });

  it('settles on the canonical link whatever the shared one carried', async () => {
    puppeteerExtractor.mockResolvedValue(fixture('kleinanzeigen_detail.html'));
    const listing = await config.fetchListingByUrl(`${AD}?utm_source=sharesheet&utm_medium=social#top`, browser);

    expect(listing.link).toBe(AD);
    // The tracking parameters do not reach the portal either.
    expect(puppeteerExtractor.mock.calls[0][0]).toBe(AD);
  });

  it('answers null for a URL that names no advert, without loading it', async () => {
    for (const url of [
      'https://www.kleinanzeigen.de/s-immobilien/duesseldorf/anzeige:angebote/wohnung/k0c195l2068r5',
      'https://www.kleinanzeigen.de/',
      'https://www.kleinanzeigen.de/s-anzeige/',
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
    puppeteerExtractor.mockResolvedValue(fixture('kleinanzeigen.html'));
    expect(await config.fetchListingByUrl(AD, browser)).toBeNull();

    puppeteerExtractor.mockRejectedValue(new Error('Target closed'));
    expect(await config.fetchListingByUrl(AD, browser)).toBeNull();
  });
});
