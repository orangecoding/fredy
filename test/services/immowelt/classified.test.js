/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn(async () => {}) }));
vi.mock('../../../lib/services/logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const { normalizeClassified, probeClassifiedPrice, readExposePrice } =
  await import('../../../lib/services/immowelt/classified.js');

const FIXTURES = path.resolve('test/testFixtures');

/**
 * @param {string} name
 * @returns {string}
 */
function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

/**
 * The price probe of the platform immowelt and SeLoger share. Whatever it reads has to be the figure
 * the listing was stored with, or every listing reports a change on its first probe.
 */
describe('#classified exposé price', () => {
  it('reads the figure the card shows out of the exposé state', () => {
    expect(readExposePrice(fixture('seloger_detail.html'))).toBe(1190);
    expect(readExposePrice(fixture('immowelt_detail_serverstate.html'))).toBe(2474300);
  });

  // The point of the probe. One that reads a different figure than the search stored is not a
  // broken feature, it invents a price change for every listing of the provider on the same run.
  it.each([
    ['seloger', 'seloger_detail.html'],
    ['immowelt', 'immowelt_detail.html'],
  ])('agrees with the price the %s search stores for the same listing', (provider, detail) => {
    const listed = JSON.parse(fixture(`${provider}_classifieds.json`)).map((card) => normalizeClassified(card).price);
    expect(listed).toContain(readExposePrice(fixture(detail)));
  });

  it('falls back to the title of an exposé that embeds no state', () => {
    expect(readExposePrice(fixture('immowelt_detail.html'))).toBe(1250);
  });

  it('has no price for a page that states none', () => {
    expect(readExposePrice('<html><body>nothing here</body></html>')).toBeNull();
    expect(readExposePrice(null)).toBeNull();
  });
});

/**
 * A browser whose page answers every in-page request through `handler`, the way the transport's
 * own tests drive it.
 *
 * @param {(url: string) => {status: number, body: string}} handler
 * @returns {{browser: any, requests: string[]}}
 */
function fakeBrowser(handler) {
  const requests = [];
  const page = {
    isClosed: () => false,
    goto: async () => {},
    waitForFunction: async () => {},
    close: async () => {},
    evaluate: async (fn, ...args) => {
      const original = globalThis.fetch;
      globalThis.fetch = async (url) => {
        requests.push(String(url));
        const { status, body } = handler(String(url));
        return { status, text: async () => body };
      };
      try {
        return await fn(...args);
      } finally {
        globalThis.fetch = original;
      }
    },
  };
  return { browser: { newPage: async () => page }, requests };
}

/**
 * The price tracker's probe for the platform. It reads the exposé through the warmed session, since
 * a cold navigation to it meets the DataDome captcha, and a page that never renders has no price.
 */
describe('#classified price probe', () => {
  const LINK = 'https://www.seloger.com/annonce/location/ile-de-france/paris-75/paris-75000/2656V5QWWXYC';

  it('reads the current price off the exposé, fetched in the session', async () => {
    const { browser, requests } = fakeBrowser(() => ({ status: 200, body: fixture('seloger_detail.html') }));

    expect(await probeClassifiedPrice({ link: LINK }, browser)).toBe(1190);
    expect(requests).toEqual([LINK]);
  });

  it('has no price when the exposé is refused', async () => {
    const { browser } = fakeBrowser(() => ({ status: 403, body: 'blocked' }));

    expect(await probeClassifiedPrice({ link: LINK }, browser)).toBeNull();
  });

  // The sister portal's adverts are only asked whether they are still online; their exposé is not
  // the platform's to read.
  it('does not read the exposé of a Belles Demeures advert', async () => {
    const { browser, requests } = fakeBrowser(() => ({ status: 200, body: fixture('seloger_detail.html') }));

    expect(
      await probeClassifiedPrice({ link: 'https://www.bellesdemeures.com/annonces/vente/paris-75/1.htm' }, browser),
    ).toBeNull();
    expect(requests).toEqual([]);
  });
});
