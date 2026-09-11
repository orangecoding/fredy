/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { publicationDate } from '../../lib/utils/publicationDate.js';
import { config as imaxx } from '../../lib/provider/imaxx.js';
import { config as flatfox } from '../../lib/provider/flatfox.js';
import { config as immowelt } from '../../lib/provider/immowelt.js';
import { config as willhaben } from '../../lib/provider/willhaben.js';
import { config as engelVoelkers } from '../../lib/provider/engelVoelkers.js';
import { readNextData } from '../../lib/utils/priceExtractors.js';
import puppeteerExtractor from '../../lib/services/extractor/puppeteerExtractor.js';

vi.mock('../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: vi.fn() }));
const fixture = (name) => readFileSync(new URL(`../testFixtures/${name}`, import.meta.url), 'utf8');
afterEach(() => vi.unstubAllGlobals());

describe('publication timestamps', () => {
  it.each([
    null,
    undefined,
    '',
    false,
    {},
    0,
    -1,
    Infinity,
    NaN,
    1e20,
    'vor 3 Tagen',
    '2026-08-20',
    '2026-08-20T14:06:30',
    '2026-02-30T12:00:00Z',
    '2026-13-01T12:00:00Z',
  ])('rejects %j', (value) => {
    expect(publicationDate(value)).toBeUndefined();
  });

  it('preserves explicit offsets and milliseconds', () => {
    expect(publicationDate('2026-08-20T14:06:30.322271+02:00')).toBe(Date.UTC(2026, 7, 20, 12, 6, 30, 322));
    expect(publicationDate(1787653680000)).toBe(1787653680000);
  });

  it('uses Flatfox publication, not creation or moving date', () => {
    const raw = JSON.parse(fixture('flatfox_listings.json'))[0];
    expect(flatfox.normalize(raw).publishedAt).toBe(Date.UTC(2026, 7, 20, 12, 6, 30, 322));
    expect(flatfox.normalize({ ...raw, published: null }).publishedAt).toBeUndefined();
  });

  it('uses Immowelt creation, not the later update', () => {
    const raw = JSON.parse(fixture('immowelt_classifieds.json'))[0];
    expect(immowelt.normalize(raw).publishedAt).toBe(Date.UTC(2026, 7, 16, 12, 25, 29, 930));
    expect(
      immowelt.normalize({ ...raw, metadata: { updateDate: raw.metadata.updateDate } }).publishedAt,
    ).toBeUndefined();
  });

  it('carries willhaben publication through fetching and normalization', async () => {
    const html = fixture('willhaben.html');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => html }));
    const listings = await willhaben.getListings('https://www.willhaben.at/iad/immobilien/');
    expect(listings.length).toBeGreaterThan(0);
    expect(willhaben.normalize(listings[0]).publishedAt).toBe(1787653680000);
    expect(willhaben.normalize({ ...listings[0], publishedAt: undefined }).publishedAt).toBeUndefined();
  });

  it('reads the Engel & Voelkers listing date without using page cache or update timestamps', async () => {
    const html = fixture('engelVoelkers_detail.html');
    const data = readNextData(html);
    const raw = data.props.pageProps.dehydratedState.queries.find((q) => q.queryKey[0] === 'listing').state.data
      .listing;
    const expected = Date.UTC(2026, 1, 23, 13, 41, 40, 66);
    expect(engelVoelkers.normalize(raw).publishedAt).toBe(expected);
    puppeteerExtractor.mockResolvedValue(html);
    expect((await engelVoelkers.fetchDetails({ id: 'test', link: 'https://example.com' })).publishedAt).toBe(expected);
    delete raw.publishedAt;
    expect(engelVoelkers.normalize(raw).publishedAt).toBeUndefined();
    puppeteerExtractor.mockResolvedValue(`<script id="__NEXT_DATA__">${JSON.stringify(data)}</script>`);
    expect((await engelVoelkers.fetchDetails({ id: 'test', publishedAt: expected })).publishedAt).toBe(expected);
  });
  it('reads IMAXX publication only from the listing WebPage', async () => {
    const link = 'https://www.imaxx.de/immobilien/wohnung-eigentumswohnung-etagenwohnung-in-giessen-kaufen-50683/';
    puppeteerExtractor.mockResolvedValue(fixture('imaxx_detail.html'));
    expect((await imaxx.fetchDetails({ id: 'test', link })).publishedAt).toBe(Date.UTC(2026, 6, 23, 22));
    const data = {
      '@graph': [
        { '@type': 'WebSite', url: link, datePublished: '2026-01-01T00:00:00Z' },
        { '@type': 'WebPage', url: 'https://www.imaxx.de/other/', datePublished: '2026-01-01T00:00:00Z' },
        { '@type': 'WebPage', url: link, dateModified: '2026-08-01T00:00:00Z' },
      ],
    };
    puppeteerExtractor.mockResolvedValue(`<script type="application/ld+json">${JSON.stringify(data)}</script>`);
    expect((await imaxx.fetchDetails({ id: 'test', link })).publishedAt).toBeUndefined();
    expect((await imaxx.fetchDetails({ id: 'test', link, publishedAt: 1784844000000 })).publishedAt).toBe(
      1784844000000,
    );
  });
});
