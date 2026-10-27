/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cheerio from 'cheerio';

import puppeteerExtractor from '../../../lib/services/extractor/puppeteerExtractor.js';
import { parse } from '../../../lib/services/extractor/parser/parser.js';
import { buildHash } from '../../../lib/utils.js';
import { config } from '../../../lib/provider/schwarzesbrett.js';
import { expectComplete, fixture } from './contract.js';

/**
 * Schwarzes Brett Bremen's `fetchListingByUrl`, which reads the advert's page through the browser.
 * See `contract.js`.
 */

vi.mock('../../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: vi.fn() }));

beforeEach(() => {
  puppeteerExtractor.mockReset();
});

/**
 * What the extractor hands over when asked to wait for `body`: that element's inner HTML, without
 * the head.
 *
 * @param {string} name
 * @returns {string}
 */
const bodyOf = (name) => cheerio.load(fixture(name))('body').html();

describe('schwarzesbrett', () => {
  const AD = 'https://schwarzesbrett.bremen.de/show/48734';
  const browser = { name: 'the run browser' };

  /** The same advert as a search run stores it, read off the recorded search page. */
  const fromSearch = () =>
    parse(config.crawlContainer, config.crawlFields, fixture('schwarzesbrett.html'))
      .map((card) => config.normalize(card))
      .find((listing) => listing.link === AD);

  it('reads the advert into the listing a search run stores', async () => {
    puppeteerExtractor.mockResolvedValue(bodyOf('schwarzesbrett_detail.html'));
    const listing = await config.fetchListingByUrl(AD, browser);

    expectComplete(listing);
    expect(puppeteerExtractor).toHaveBeenCalledWith(AD, 'body', { browser, name: 'schwarzesbrett_details' });

    const found = fromSearch();
    expect(found).toBeDefined();
    expect(listing.id).toBe(found.id);
    expect(listing.id).toBe(buildHash('48734', '700 €'));
    expect(listing.link).toBe(found.link);

    expect(listing).toMatchObject({
      title: found.title,
      price: 700,
      address: 'Außerhalb Bremens',
      image: 'https://schwarzesbrett.bremen.de/storage/images/5f5d4d04-c7bc-4920-9ecf-2faf2efaaff8.webp',
    });
    expect(listing.description).toContain('Bad Fallingbostel');
  });

  it('settles on the canonical link whatever the shared one carried', async () => {
    puppeteerExtractor.mockResolvedValue(bodyOf('schwarzesbrett_detail.html'));
    const listing = await config.fetchListingByUrl(`${AD}/?utm_source=whatsapp#text`, browser);

    expect(listing.link).toBe(AD);
    expect(puppeteerExtractor.mock.calls[0][0]).toBe(AD);
  });

  it('answers null for a URL that names no advert, without loading it', async () => {
    for (const url of [
      'https://schwarzesbrett.bremen.de/verkauf-und-angebote/mietobjekte',
      'https://schwarzesbrett.bremen.de/',
      'https://schwarzesbrett.bremen.de/show/',
      'not a url',
    ]) {
      expect(await config.fetchListingByUrl(url, browser)).toBeNull();
    }
    expect(puppeteerExtractor).not.toHaveBeenCalled();
  });

  it('answers null when the page is blocked, is another page, or fails to load', async () => {
    puppeteerExtractor.mockResolvedValue(null);
    expect(await config.fetchListingByUrl(AD, browser)).toBeNull();

    // Any other page, the search here, shows no single advert.
    puppeteerExtractor.mockResolvedValue(bodyOf('schwarzesbrett.html'));
    expect(await config.fetchListingByUrl(AD, browser)).toBeNull();

    // Another advert's page is not this one.
    puppeteerExtractor.mockResolvedValue(bodyOf('schwarzesbrett_detail.html'));
    expect(await config.fetchListingByUrl('https://schwarzesbrett.bremen.de/show/48590', browser)).toBeNull();

    puppeteerExtractor.mockRejectedValue(new Error('Target closed'));
    expect(await config.fetchListingByUrl(AD, browser)).toBeNull();
  });
});
