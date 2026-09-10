/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readSearch } from '../../lib/services/idealista/website.js';

// The transport reports a run it could not get through as a point of interest, and that reporter
// reaches for the job storage. Nothing here is a job.
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: async () => {} }));

/**
 * The other way through the wall in front of idealista's website.
 *
 * With `FREDY_CHALLENGE_SOLVER_URL` set, a result page is a plain request carrying the session
 * cookie the solver earned - which `idealista.test.js` walks. With none set there is still the
 * browser the job run already holds: DataDome's interstitial is a JavaScript challenge that solves
 * itself in a browser and then reloads the page that was asked for, and this is what waits it out.
 *
 * These tests drive the real transport against a page object rather than a mocked module, because
 * what is worth pinning is exactly what it does with the browser it is handed: one page, one
 * navigation, the wait, the document that replaced the challenge, and the page closed either way.
 */
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
  const solver = process.env.FREDY_CHALLENGE_SOLVER_URL;

  afterEach(() => {
    vi.useRealTimers();
    if (solver === undefined) delete process.env.FREDY_CHALLENGE_SOLVER_URL;
    else process.env.FREDY_CHALLENGE_SOLVER_URL = solver;
  });

  it('navigates once per result page and reads the document the challenge left behind', async () => {
    delete process.env.FREDY_CHALLENGE_SOLVER_URL;
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
    delete process.env.FREDY_CHALLENGE_SOLVER_URL;
    const { browser, pages } = stubBrowser({ cleared: false });

    expect(await readSearch(SEARCH, browser)).toEqual([]);
    expect(pages.every((page) => page.closed)).toBe(true);
  });

  /**
   * With a solver configured the browser is not touched at all: the plain request carrying the
   * session is cheaper than a navigation, and it is what the walk over the further pages uses.
   */
  it('leaves the browser alone when a solver is configured', async () => {
    process.env.FREDY_CHALLENGE_SOLVER_URL = 'http://solver.test/scrape';
    const { browser, visited } = stubBrowser({ html: '<html></html>' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      status: 200,
      headers: undefined,
      text: async () => `<html><body><main id="main-content">${card('7')}</main></body></html>`,
    });

    try {
      const adverts = await readSearch(SEARCH, browser);
      expect(adverts.map((advert) => advert.id)).toEqual(['7']);
      expect(visited).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
