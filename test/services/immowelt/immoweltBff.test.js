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

  // Once DataDome has refused one exposé it refuses the rest, so asking for them is nothing but
  // further strikes against an address that is already flagged.
  it('stops asking for exposés after the first refusal of a run', async () => {
    const browser = fakeBrowser(() => ({ status: 403, body: 'blocked' }));

    expect(await fetchExposeHtml(browser, 'https://www.immowelt.de/expose/abc')).toBeNull();
    expect(await fetchExposeHtml(browser, 'https://www.immowelt.de/expose/def')).toBeNull();

    expect(requests).toEqual(['https://www.immowelt.de/expose/abc']);
  });

  it('gives the next run an unflagged session of its own', async () => {
    const handler = () => ({ status: 200, body: '<html>expose</html>' });
    const blocked = fakeBrowser(() => ({ status: 429, body: 'slow down' }));
    await fetchExposeHtml(blocked, 'https://www.immowelt.de/expose/abc');

    expect(await fetchExposeHtml(fakeBrowser(handler), 'https://www.immowelt.de/expose/abc')).toBe(
      '<html>expose</html>',
    );
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

// The two calls immowelt's own page makes before every commute search, and the answers it gets:
// the street's coordinates, then the area reachable from them. The ring and the polyline are the
// real ones for #430's url ("15 minutes' walk of Schwanseestraße"), shortened to six points.
describe('#immowelt bff transport, commute areas', () => {
  const RING = [
    [11.60531158, 48.09858673],
    [11.60553739, 48.09829432],
    [11.60573394, 48.0978433],
    [11.60581443, 48.09735794],
    [11.605774, 48.09686761],
    [11.60561509, 48.096402],
  ];
  const POLYLINE = 'egqdHetyeAz@m@xAe@~AO`BF|A\\';

  const COMMUTE_REQUEST = {
    criteria: { distributionTypes: ['Buy'], location: {} },
    paging: { page: 1, size: 100, order: 'DateDesc' },
    commutes: [{ placeId: 'STRTDE197842', duration: 15, mode: 'Walk' }],
  };

  /** The body of every `/serp-bff/search` the page posted, parsed. */
  let posted;

  /**
   * @param {object} [overrides] answers to replace, keyed by the path they belong to
   * @returns {any} a browser answering the whole commute flow
   */
  function commuteBrowser(overrides = {}) {
    return fakeBrowser((url, init) => {
      if (url.startsWith('/search-mfe-bff/places/data')) {
        return (
          overrides.places ?? {
            status: 200,
            body: JSON.stringify({ places: [{ coordinates: { lat: 48.1, lng: 11.6 } }] }),
          }
        );
      }
      if (url.startsWith('/search-mfe-bff/routing/isochrone')) {
        return overrides.routing ?? { status: 200, body: JSON.stringify({ isochrone: [[RING]] }) };
      }
      if (url.startsWith('/serp-bff/search')) {
        posted.push(JSON.parse(init.body));
        return { status: 200, body: searchResponse(1) };
      }
      return { status: 200, body: listResponse(url) };
    });
  }

  beforeEach(() => {
    requests = [];
    posted = [];
  });

  it('draws the commute area before searching and sends it as the search boundary', async () => {
    await searchClassifieds(commuteBrowser(), COMMUTE_REQUEST);

    expect(requests[0]).toContain('/search-mfe-bff/places/data?placesIds%5B%5D=STRTDE197842');
    expect(requests[1]).toContain('/search-mfe-bff/routing/isochrone');
    expect(requests[1]).toContain('commuteMode=Walk');
    expect(requests[1]).toContain('commuteDuration=15');
    expect(requests[1]).toContain('lat=48.1');
    expect(requests[1]).toContain('lng=11.6');
    expect(posted[0].criteria.location).toEqual({ polylines: [POLYLINE] });
    expect(posted[0].commutes).toBeUndefined();
  });

  // The BFF unions the polylines of a search, so a drawn area saved next to a commute time has to
  // survive the resolution rather than be replaced by it.
  it('adds the drawn boundary to the ones already in the criteria', async () => {
    await searchClassifieds(commuteBrowser(), {
      ...COMMUTE_REQUEST,
      criteria: { ...COMMUTE_REQUEST.criteria, location: { polylines: ['ah{vHm`xrA?ivIj`C??hvIk`C?'] } },
    });

    expect(posted[0].criteria.location.polylines).toEqual(['ah{vHm`xrA?ivIj`C??hvIk`C?', POLYLINE]);
  });

  it('leaves a search without a commute area alone, and does not ask the routing service', async () => {
    await searchClassifieds(commuteBrowser(), SEARCH_REQUEST);

    expect(requests.some((url) => url.includes('/search-mfe-bff/'))).toBe(false);
    expect(posted[0].criteria.location).toEqual({ placeIds: ['AD08DE8634'] });
  });

  // Searching without the boundary would search the street the commute starts on instead of
  // everything within reach of it, and report a different set of flats than the job describes.
  it('stops the run when the routing service will not draw the area', async () => {
    const browser = commuteBrowser({ routing: { status: 500, body: '<html>Unbekannter Fehler</html>' } });

    await expect(searchClassifieds(browser, COMMUTE_REQUEST)).rejects.toThrow(/commute time/);
    expect(posted).toHaveLength(0);
  });

  it('stops the run when the place it should travel from has no coordinates', async () => {
    const browser = commuteBrowser({ places: { status: 200, body: JSON.stringify({ places: [{}] }) } });

    await expect(searchClassifieds(browser, COMMUTE_REQUEST)).rejects.toThrow(/commute time/);
    expect(posted).toHaveLength(0);
  });

  it('stops the run when nothing is reachable in the time the job asks for', async () => {
    const browser = commuteBrowser({ routing: { status: 200, body: JSON.stringify({ isochrone: [] }) } });

    await expect(searchClassifieds(browser, COMMUTE_REQUEST)).rejects.toThrow(/no reachable area/);
    expect(posted).toHaveLength(0);
  });
});
