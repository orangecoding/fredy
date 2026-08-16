/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn(async () => {}) }));
vi.mock('../../../lib/services/logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const { searchClassifieds, fetchExposeHtml, releaseSession } =
  await import('../../../lib/services/immowelt/immoweltBff.js');

const SEARCH_REQUEST = {
  criteria: { distributionTypes: ['Rent'], location: { placeIds: ['AD08DE8634'] } },
  paging: { page: 1, size: 100, order: 'DateDesc' },
};

/** Every request the page issued, in order. */
let requests;

/**
 * A browser whose page runs the evaluated function in-process against a stubbed `fetch`.
 *
 * The functions handed to `page.evaluate` only use `fetch`, `JSON`, `Promise` and `setTimeout`, all
 * of which node has, so running them here exercises the real batching and error handling rather
 * than a reimplementation of it.
 *
 * @param {(url: string, init?: any) => {status: number, body: string}} handler answers one request
 * @returns {any} something shaped enough like a puppeteer browser
 */
function fakeBrowser(handler) {
  const page = {
    isClosed: () => false,
    goto: async () => {},
    waitForFunction: async () => {},
    close: async () => {},
    evaluate: async (fn, ...args) => {
      const original = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        requests.push(String(url));
        const { status, body } = handler(String(url), init);
        return { status, text: async () => body, json: async () => JSON.parse(body) };
      };
      try {
        return await fn(...args);
      } finally {
        globalThis.fetch = original;
      }
    },
  };
  return { newPage: async () => page };
}

/**
 * @param {number} count how many ids the search should answer with
 * @returns {string} the search response body
 */
function searchResponse(count) {
  return JSON.stringify({
    totalCount: count,
    classifieds: Array.from({ length: count }, (_, index) => ({ id: `26ABCDEF${String(index).padStart(4, '0')}` })),
  });
}

/**
 * @param {string} url a `/classifiedList/…` url
 * @returns {string} one card payload per id in the url
 */
function listResponse(url) {
  const ids = url.replace('/classifiedList/', '').split(',');
  return JSON.stringify(ids.map((id) => ({ id, url: `https://www.immowelt.de/expose/${id}` })));
}

describe('#immowelt bff transport', () => {
  beforeEach(() => {
    requests = [];
  });

  // The bug this pins: immowelt's edge answers 403 once the /classifiedList path grows past about
  // a kilobyte. Asking for all 100 ids in one url produced a 1315 character path and lost the
  // entire run - while every batch below 50 ids went through untouched.
  it('splits the id lookup into batches short enough for immowelt to answer', async () => {
    const browser = fakeBrowser((url) =>
      url.startsWith('/serp-bff/search')
        ? { status: 200, body: searchResponse(100) }
        : { status: 200, body: listResponse(url) },
    );

    const classifieds = await searchClassifieds(browser, SEARCH_REQUEST);

    expect(classifieds).toHaveLength(100);

    const listRequests = requests.filter((url) => url.startsWith('/classifiedList/'));
    expect(listRequests).toHaveLength(4);
    for (const url of listRequests) {
      expect(url.length).toBeLessThan(700);
      expect(url.replace('/classifiedList/', '').split(',').length).toBeLessThanOrEqual(30);
    }
  });

  it('asks for every id exactly once', async () => {
    const browser = fakeBrowser((url) =>
      url.startsWith('/serp-bff/search')
        ? { status: 200, body: searchResponse(65) }
        : { status: 200, body: listResponse(url) },
    );

    const classifieds = await searchClassifieds(browser, SEARCH_REQUEST);
    const ids = classifieds.map((entry) => entry.id);

    expect(ids).toHaveLength(65);
    expect(new Set(ids).size).toBe(65);
  });

  // Half a result page is worth reporting: whatever is missed stays unstored and simply counts as
  // new on the next run.
  it('keeps the batches that came back when a later one is refused', async () => {
    let batch = 0;
    const browser = fakeBrowser((url) => {
      if (url.startsWith('/serp-bff/search')) return { status: 200, body: searchResponse(100) };
      batch += 1;
      return batch > 2 ? { status: 403, body: 'blocked' } : { status: 200, body: listResponse(url) };
    });

    expect(await searchClassifieds(browser, SEARCH_REQUEST)).toHaveLength(60);
  });

  it('gives up when the search itself is refused', async () => {
    const browser = fakeBrowser(() => ({ status: 403, body: 'blocked' }));

    expect(await searchClassifieds(browser, SEARCH_REQUEST)).toEqual([]);
    expect(requests.filter((url) => url.startsWith('/classifiedList/'))).toHaveLength(0);
  });

  it('does not ask for card payloads when the search found nothing', async () => {
    const browser = fakeBrowser(() => ({ status: 200, body: searchResponse(0) }));

    expect(await searchClassifieds(browser, SEARCH_REQUEST)).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it('warms the session once and reuses it for the exposé', async () => {
    let created = 0;
    const handler = (url) =>
      url.startsWith('/serp-bff/search')
        ? { status: 200, body: searchResponse(1) }
        : { status: 200, body: url.startsWith('/classifiedList/') ? listResponse(url) : '<html>expose</html>' };

    const base = fakeBrowser(handler);
    const browser = {
      newPage: async () => {
        created += 1;
        return base.newPage();
      },
    };

    await searchClassifieds(browser, SEARCH_REQUEST);
    await fetchExposeHtml(browser, 'https://www.immowelt.de/expose/abc');

    expect(created).toBe(1);
    await releaseSession(browser);
  });

  it('returns null rather than markup when the exposé is refused', async () => {
    const browser = fakeBrowser(() => ({ status: 403, body: 'blocked' }));

    expect(await fetchExposeHtml(browser, 'https://www.immowelt.de/expose/abc')).toBeNull();
  });

  it('gives each browser its own session, so concurrent jobs cannot share one', async () => {
    const pages = [];
    const build = () => {
      const base = fakeBrowser((url) =>
        url.startsWith('/serp-bff/search')
          ? { status: 200, body: searchResponse(1) }
          : { status: 200, body: listResponse(url) },
      );
      return {
        newPage: async () => {
          const page = await base.newPage();
          pages.push(page);
          return page;
        },
      };
    };

    const first = build();
    const second = build();
    await searchClassifieds(first, SEARCH_REQUEST);
    await searchClassifieds(second, SEARCH_REQUEST);

    expect(pages).toHaveLength(2);
  });
});
