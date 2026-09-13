/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../lib/provider/casa.js';
import { translateSearchUrl } from '../../lib/services/casa/web-translator.js';
import puppeteerExtractor from '../../lib/services/extractor/puppeteerExtractor.js';

vi.mock('../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: vi.fn() }));

const URL = 'https://www.casa.it/srp/map/?tr=vendita&q=62125490';
const failures = {
  network: () => Promise.reject(new TypeError('fetch failed')),
  json: () => Promise.resolve(new Response('{')),
  http: () => Promise.resolve(new Response('', { status: 503 })),
};

describe('Casa search failures', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it.each(Object.keys(failures))('uses the browser fallback after a first-page %s failure', async (kind) => {
    const listings = [{ id: 'browser-listing' }];
    const state = { search: { list: listings, paginator: { totalPages: 1 } } };
    puppeteerExtractor.mockResolvedValue(
      `window.__INITIAL_STATE__ = JSON.parse(${JSON.stringify(JSON.stringify(state))})`,
    );
    vi.stubGlobal('fetch', vi.fn(failures[kind]));
    const browser = {};

    await expect(config.getListings(URL, browser)).resolves.toEqual(listings);
    expect(puppeteerExtractor).toHaveBeenCalledWith(URL, 'body', { browser, name: 'casa' });
  });

  it.each(Object.keys(failures))('retains page one after a second-page %s failure', async (kind) => {
    const listings = Array.from({ length: 50 }, (_, index) => ({ listing_id: String(index) }));
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, options) =>
        JSON.parse(options.body).page === 1
          ? Promise.resolve(
              new Response(JSON.stringify({ data: { total: 100, tiers: [{ tier: 'listings', results: listings }] } })),
            )
          : failures[kind](),
      ),
    );

    await expect(config.getListings(URL, {})).resolves.toEqual(listings);
    expect(puppeteerExtractor).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['example.invalid', 'casa.it.example.invalid', 'www.casa.it.example.invalid'])(
    'rejects the host %s before any request',
    async (host) => {
      vi.stubGlobal('fetch', vi.fn());
      for (const path of ['/srp/map/?tr=vendita&q=62125490', '/affitto/residenziale/roma/']) {
        const url = `https://${host}${path}`;
        await expect(translateSearchUrl(url)).resolves.toBeNull();
        await expect(config.getListings(url, {})).resolves.toEqual([]);
      }
      expect(fetch).not.toHaveBeenCalled();
      expect(puppeteerExtractor).not.toHaveBeenCalled();
    },
  );

  it.each(['https://casa.it', 'https://www.casa.it', 'http://www.casa.it'])(
    'accepts a search on %s',
    async (origin) => {
      await expect(translateSearchUrl(`${origin}/srp/map/?tr=vendita&q=62125490`)).resolves.toMatchObject({
        where: [{ hkey: '62125490' }],
        filters: { 'transaction.type': 'vendita' },
      });
    },
  );
});
