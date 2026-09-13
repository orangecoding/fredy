/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readSearch } from '../../lib/services/idealista/website.js';

// The transport reports a run it could not get through as a point of interest, and that reporter
// reaches for the job storage. Nothing here is a job.
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: async () => {} }));

const SEARCH = 'https://www.idealista.it/vendita-terreni/roma-roma/';

/**
 * @param {string} id
 * @returns {string} one result card, as the portal writes it
 */
const card = (id) =>
  `<article class="item" data-element-id="${id}">
     <a class="item-link" href="/immobile/${id}/" title="Villa in Via Giulia, Roma"></a>
     <span class="item-price">300.000€</span>
     <div class="item-detail-char"><span class="item-detail">4 locali</span><span class="item-detail">120 m²</span></div>
   </article>`;

/**
 * A browser that answers one navigation with one page.
 *
 * @param {{html?: string|null, cleared?: boolean, status?: number}} [behaviour]
 * @returns {{browser: any, pages: any[], visited: string[]}}
 */
function stubBrowser({ html = null, cleared = true, status = 403 } = {}) {
  const visited = [];
  const pages = [];

  const browser = {
    newPage: async () => {
      const page = {
        closed: false,
        goto: async (url) => {
          visited.push(url);
          return { status: () => status };
        },
        // The wall is cleared when the result container turns up before the wait runs out.
        waitForFunction: async () => {
          if (!cleared) throw new Error('waiting failed');
          return true;
        },
        content: async () => html,
        close: async () => {
          page.closed = true;
        },
      };
      pages.push(page);
      return page;
    },
  };

  return { browser, pages, visited };
}

describe('the website read through the run own browser', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('navigates once per result page and reads the document the challenge left behind', async () => {
    const { browser, pages, visited } = stubBrowser({
      html: `<html><body><main id="main-content">${card('42')}</main></body></html>`,
    });

    const adverts = await readSearch(SEARCH, browser);

    expect(adverts).toHaveLength(1);
    expect(adverts[0]).toMatchObject({
      id: '42',
      link: 'https://www.idealista.it/immobile/42/',
      characteristics: ['4 locali', '120 m²'],
    });
    // One page, the first of the search, and it was closed again.
    expect(visited).toEqual([SEARCH]);
    expect(pages.every((page) => page.closed)).toBe(true);
  });

  /**
   * The 403 is the normal case here - it is the challenge, not the refusal - so what says the run
   * failed is the wait running out with no result container, and the answer to that is no listings
   * rather than a broken one.
   */
  it('gives up on the page whose challenge never cleared', async () => {
    const { browser, pages } = stubBrowser({ cleared: false });

    expect(await readSearch(SEARCH, browser)).toEqual([]);
    expect(pages.every((page) => page.closed)).toBe(true);
  });

  it('stops immediately on a rate limit and closes the page', async () => {
    const { browser, pages, visited } = stubBrowser({ status: 429, html: card('7') });
    expect(await readSearch(SEARCH, browser)).toEqual([]);
    expect(visited).toHaveLength(1);
    expect(pages.every((page) => page.closed)).toBe(true);
  });

  it('walks full pages and retains results when a later page is rate limited', async () => {
    const visited = [];
    const closed = [];
    const browser = {
      newPage: async () => {
        let pageNumber;
        return {
          goto: async (url) => {
            visited.push(url);
            pageNumber = visited.length;
            return { status: () => (pageNumber === 3 ? 429 : 200) };
          },
          waitForFunction: async () => true,
          content: async () => Array.from({ length: 30 }, (_, i) => card(String(pageNumber * 100 + i))).join(''),
          close: async () => closed.push(pageNumber),
        };
      },
    };
    vi.useFakeTimers();
    const walk = readSearch(SEARCH, browser);
    await vi.runAllTimersAsync();
    expect(await walk).toHaveLength(60);
    expect(visited).toHaveLength(3);
    expect(visited[2]).toContain('/lista-3.htm');
    expect(closed).toEqual([1, 2, 3]);
  });

  it('stops when a full page repeats the previous listings', async () => {
    const { browser, visited } = stubBrowser({ html: Array.from({ length: 30 }, (_, i) => card(String(i))).join('') });
    vi.useFakeTimers();
    const walk = readSearch(SEARCH, browser);
    await vi.runAllTimersAsync();
    expect(await walk).toHaveLength(30);
    expect(visited).toHaveLength(2);
  });
});
