/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn(async () => {}) }));
vi.mock('../../../lib/services/logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const { searchAds } = await import('../../../lib/services/leboncoin/finder.js');
const { trackPoi } = await import('../../../lib/services/tracking/Tracker.js');

/** Every request a page issued, as `[url, init]`. */
let requests;

/** Every url a page was warmed on, in order. */
let gotos;

/**
 * A browser whose pages run the evaluated function in-process against a stubbed `fetch`, the way
 * the immowelt transport's tests do: the function handed to `page.evaluate` only needs `fetch`,
 * `JSON`, `Promise` and `setTimeout`, so the real request and error handling runs here.
 *
 * @param {(url: string, init?: any) => {status: number, body: string}} handler answers one request
 * @returns {{newPage: () => Promise<any>, pages: any[]}}
 */
function fakeBrowser(handler) {
  const pages = [];
  return {
    pages,
    newPage: async () => {
      const page = {
        closed: false,
        isClosed: () => page.closed,
        goto: async (url) => {
          gotos.push(String(url));
        },
        waitForFunction: async () => {},
        close: async () => {
          page.closed = true;
        },
        evaluate: async (fn, ...args) => {
          const original = globalThis.fetch;
          globalThis.fetch = async (url, init) => {
            requests.push([String(url), init]);
            const { status, body } = handler(String(url), init);
            return { status, text: async () => body };
          };
          try {
            return await fn(...args);
          } finally {
            globalThis.fetch = original;
          }
        },
      };
      pages.push(page);
      return page;
    },
  };
}

const BODY = { limit: 35, filters: { category: { id: '10' }, enums: { ad_type: ['offer'] } } };

describe('#leboncoin finder transport', () => {
  beforeEach(() => {
    requests = [];
    gotos = [];
    vi.mocked(trackPoi).mockClear();
  });

  it("asks the finder from a page on leboncoin, with the web app's key", async () => {
    const browser = fakeBrowser(() => ({ status: 200, body: JSON.stringify({ total: 1, ads: [{ list_id: 1 }] }) }));

    const ads = await searchAds(browser, BODY);

    expect(ads).toEqual([{ list_id: 1 }]);
    expect(gotos).toEqual(['https://www.leboncoin.fr/']);
    const [[url, init]] = requests;
    expect(url).toBe('https://api.leboncoin.fr/finder/search');
    expect(init.method).toBe('POST');
    expect(init.headers.api_key).toBeTruthy();
    expect(JSON.parse(init.body)).toEqual(BODY);
  });

  // A run asks the finder exactly once and has no use for the page afterwards; left open, it kept
  // running the home page's ad and tracking scripts inside the job's browser until the job ended.
  it('lets go of the page once the search is done', async () => {
    const browser = fakeBrowser(() => ({ status: 200, body: JSON.stringify({ ads: [] }) }));

    await searchAds(browser, BODY);

    expect(browser.pages).toHaveLength(1);
    expect(browser.pages[0].closed).toBe(true);
  });

  it('answers no adverts when the finder refuses, and counts the bot wall', async () => {
    const browser = fakeBrowser(() => ({ status: 403, body: '<html>captcha</html>' }));

    expect(await searchAds(browser, BODY)).toEqual([]);
    expect(trackPoi).toHaveBeenCalledWith('DETECTED_AS_BOT_leboncoin');
    expect(browser.pages[0].closed).toBe(true);
  });

  it('answers no adverts, without counting a bot wall, for any other refusal', async () => {
    const browser = fakeBrowser(() => ({ status: 400, body: '{"message":"bad filter"}' }));

    expect(await searchAds(browser, BODY)).toEqual([]);
    expect(trackPoi).not.toHaveBeenCalled();
  });
});
