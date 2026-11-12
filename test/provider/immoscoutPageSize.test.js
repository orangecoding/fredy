/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { config } from '../../lib/provider/immoscout.js';

/**
 * Regression test for https://github.com/orangecoding/fredy/issues/521 - a run reads one page of
 * results, and the mobile API's default page holds 50 of them. It takes up to 100 in the same
 * request, so asking for that doubles what one run sees without a second request.
 */
const SEARCH_URL =
  'https://api.mobile.immobilienscout24.de/search/list?exclusioncriteria=foreclosure,projectlisting&geocodes=%2Fde%2Fhessen%2Fwiesbaden&realestatetype=apartmentbuy&searchType=region&sorting=-firstactivation';

let requestedUrls;

beforeEach(() => {
  requestedUrls = [];
  vi.stubGlobal('fetch', async (url) => {
    requestedUrls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ resultListItems: [] }) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('immoscout search page size', () => {
  it('asks for the largest page the mobile API serves', async () => {
    await config.getListings(SEARCH_URL);

    expect(requestedUrls).toHaveLength(1);
    expect(new URL(requestedUrls[0]).searchParams.get('pagesize')).toBe('100');
  });

  it('keeps every search parameter as it was', async () => {
    await config.getListings(SEARCH_URL);

    const sent = new URL(requestedUrls[0]).searchParams;
    sent.delete('pagesize');
    expect(Object.fromEntries(sent)).toEqual(Object.fromEntries(new URL(SEARCH_URL).searchParams));
  });
});
