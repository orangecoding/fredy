/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../lib/provider/immobiliare.js';
import { clearPlaceCache } from '../../lib/services/immobiliare/geography.js';
import puppeteerExtractor from '../../lib/services/extractor/puppeteerExtractor.js';

vi.mock('../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: vi.fn() }));

const TOWN = 'https://www.immobiliare.it/affitto-case/roma/';
const MAP = 'https://www.immobiliare.it/search-list/?idContratto=2&idComune=6737';
const geography = [{ id: '6737', type: 2, label: 'Roma', parents: [] }];
const json = (body) => new Response(JSON.stringify(body));
const failures = {
  network: () => Promise.reject(new TypeError('fetch failed')),
  json: () => Promise.resolve(new Response('{')),
  http: () => Promise.resolve(new Response('', { status: 503 })),
};

describe('Immobiliare search failures', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    clearPlaceCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each(Object.keys(failures))('uses the town browser fallback after a first-page %s failure', async (kind) => {
    const listings = [{ id: 'browser-listing' }];
    const state = {
      props: {
        pageProps: {
          dehydratedState: {
            queries: [
              {
                queryKey: ['real-estate-list', { idComune: '6737' }],
                state: { data: { results: listings, maxPages: 2 } },
              },
            ],
          },
        },
      },
    };
    puppeteerExtractor.mockResolvedValue(`<script id="__NEXT_DATA__">${JSON.stringify(state)}</script>`);
    vi.stubGlobal(
      'fetch',
      vi.fn((url) =>
        String(url).includes('/geography/autocomplete') ? Promise.resolve(json(geography)) : failures[kind](),
      ),
    );
    const browser = {};

    const pending = expect(config.getListings(TOWN, browser)).resolves.toEqual(listings);
    await vi.runAllTimersAsync();
    await pending;
    expect(puppeteerExtractor).toHaveBeenCalledWith(TOWN, 'body', { browser, name: 'immobiliare' });
  });

  for (const url of [TOWN, MAP]) {
    it.each(Object.keys(failures))(`retains earlier pages after a %s failure for ${url}`, async (kind) => {
      const listings = [{ id: 'page-1' }, { id: 'page-2' }];
      vi.stubGlobal(
        'fetch',
        vi.fn((target) => {
          const address = new URL(target);
          if (address.pathname.includes('/geography/autocomplete')) return Promise.resolve(json(geography));
          const page = Number(address.searchParams.get('pag'));
          return page < 3 ? Promise.resolve(json({ results: [listings[page - 1]], maxPages: 3 })) : failures[kind]();
        }),
      );

      const pending = expect(config.getListings(url, {})).resolves.toEqual(listings);
      await vi.runAllTimersAsync();
      await pending;
      expect(puppeteerExtractor).not.toHaveBeenCalled();
    });
  }
});
