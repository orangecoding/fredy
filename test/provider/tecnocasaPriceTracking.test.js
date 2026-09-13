/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPrice, readComponentData } from '../../lib/services/tecnocasa/network.js';

const { config: tecnocasa } = await import('../../lib/provider/tecnocasa.js');
const { config: tecnorete } = await import('../../lib/provider/tecnorete.js');
const fixture = (name) => readFileSync(new URL(`../testFixtures/${name}.html`, import.meta.url), 'utf8');
afterEach(() => vi.unstubAllGlobals());

describe.each([
  ['tecnocasa', tecnocasa, 170000],
  ['tecnorete', tecnorete, 499000],
])('%s price tracking', (brand, config, expected) => {
  const link = `https://www.${brand}.it/listing.html`;
  const listing = { id: 'test', link };

  it('reads the HTTP fixture and agrees with the search price for the same advert', async () => {
    const html = fixture(`${brand}_detail`);
    const estate = readComponentData(html, ':estate', 'estate-show');
    const search = readComponentData(fixture(brand), ':estates');
    const card = search.find((item) => item.id === estate.id);
    expect(card).toBeDefined();
    expect(config.normalize(card).price).toBe(expected);
    const fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => html });
    vi.stubGlobal('fetch', fetch);

    expect(await config.priceTracking.probe(listing)).toBe(expected);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(link, {
      headers: { 'User-Agent': expect.any(String), 'Accept-Language': 'it-IT,it;q=0.9' },
    });
    expect(config.priceTracking.extract).toBeUndefined();
    expect(extractPrice(html)).toBe(expected);
  });

  it.each([403, 404, 429])('returns unknown for HTTP %s without parsing the body', async (status) => {
    const text = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, statusText: 'Unavailable', text }));
    expect(await config.priceTracking.probe(listing)).toBeNull();
    expect(text).not.toHaveBeenCalled();
  });

  it('returns unknown when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
    expect(await config.priceTracking.probe(listing)).toBeNull();
  });

  it.each([
    '<html><body><div class="price">170.000 EUR</div></body></html>',
    '<estate-show-v1 :estate="invalid"></estate-show-v1>',
    '<estate-show-v1 :estate="{}"></estate-show-v1>',
    '<estate-sticky-bar :estate="{&quot;numeric_price&quot;:170000}"></estate-sticky-bar>',
  ])('returns unknown when bound estate data is unusable: %s', async (html) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => html }));
    expect(await config.priceTracking.probe(listing)).toBeNull();
    expect(extractPrice(html)).toBeNull();
  });

  it.each([0, -1, null, 'unknown'])('rejects an invalid numeric price: %j', async (price) => {
    const data = JSON.stringify({ numeric_price: price }).replaceAll('"', '&quot;');
    const html = `<estate-show-v1 :estate="${data}"></estate-show-v1>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => html }));
    expect(await config.priceTracking.probe(listing)).toBeNull();
  });
});
