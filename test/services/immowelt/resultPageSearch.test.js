/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import LZString from 'lz-string';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/services/logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));
vi.mock('../../../lib/services/immowelt/immoweltBff.js', () => ({
  fetchResultPageHtml: vi.fn(),
  searchClassifieds: vi.fn(async () => [{ id: 'from-bff' }]),
  fetchExposeHtml: vi.fn(async () => null),
  probeExpose: vi.fn(async () => -1),
}));

const { fetchResultPageHtml, searchClassifieds } = await import('../../../lib/services/immowelt/immoweltBff.js');
const { default: logger } = await import('../../../lib/services/logger.js');
const { buildClassifiedProvider } = await import('../../../lib/services/immowelt/platformProvider.js');

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../testFixtures');
const RECORDED = fs.readFileSync(path.join(FIXTURES, 'immowelt_serp.html'), 'utf8');

const SEARCH_URL =
  'https://www.immowelt.de/classified-search?distributionTypes=Rent&estateTypes=Apartment&locations=AD08DE6345&order=DateDesc&page=2';
const BROWSER = {};

describe('#immowelt platform provider search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the listings off the result page and leaves the BFF alone', async () => {
    fetchResultPageHtml.mockResolvedValue(RECORDED);
    const { config } = buildClassifiedProvider('immowelt', { readsResultPage: true });

    const classifieds = await config.getListings(SEARCH_URL, BROWSER);

    expect(classifieds).toHaveLength(30);
    expect(fetchResultPageHtml).toHaveBeenCalledWith(
      BROWSER,
      SEARCH_URL,
      expect.objectContaining({ host: 'immowelt.de' }),
    );
    expect(searchClassifieds).not.toHaveBeenCalled();
  });

  // Page N has to mean the same 30 cards on both paths, or a walk whose second page falls back would
  // skip cards 31 to 100.
  it('asks the BFF for the same page of 30 when the result page carries nothing readable', async () => {
    fetchResultPageHtml.mockResolvedValue(null);
    const { config } = buildClassifiedProvider('immowelt', { readsResultPage: true });

    expect(await config.getListings(SEARCH_URL, BROWSER)).toEqual([{ id: 'from-bff' }]);

    const [, request] = searchClassifieds.mock.calls[0];
    expect(request.paging).toEqual({ page: 2, size: 30, order: 'DateDesc' });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('asking the search api instead'));
  });

  // A search without hits is an answer, not a failure: asking the BFF would only collect a 403.
  it('keeps a result page without hits as an empty search, without asking the BFF', async () => {
    const packed = LZString.compressToBase64(JSON.stringify({ pageProps: { classifieds: [], classifiedsData: {} } }));
    fetchResultPageHtml.mockResolvedValue(
      `<script id="__UFRN_FETCHER__">window["__UFRN_FETCHER__"]=JSON.parse(${JSON.stringify(
        JSON.stringify({ data: { 'classified-serp-init-data': packed } }),
      )});</script>`,
    );
    const { config } = buildClassifiedProvider('immowelt', { readsResultPage: true });

    expect(await config.getListings(SEARCH_URL, BROWSER)).toEqual([]);
    expect(searchClassifieds).not.toHaveBeenCalled();
  });

  it('asks only the BFF, a page of 100, for a provider that does not read the result page', async () => {
    const { config } = buildClassifiedProvider('immowelt');

    expect(await config.getListings(SEARCH_URL, BROWSER)).toEqual([{ id: 'from-bff' }]);

    expect(fetchResultPageHtml).not.toHaveBeenCalled();
    expect(searchClassifieds.mock.calls[0][1].paging.size).toBe(100);
  });
});
