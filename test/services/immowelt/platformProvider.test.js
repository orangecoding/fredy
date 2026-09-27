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

const immowelt = await import('../../../lib/provider/immowelt.js');
const seloger = await import('../../../lib/provider/seloger.js');

const SELOGER_EXPOSE = fs.readFileSync(path.resolve('test/testFixtures/seloger_detail.html'), 'utf8');
const SELOGER_LINK = 'https://www.seloger.com/annonce/location/ile-de-france/paris-75/paris-75000/2656V5QWWXYC';

/**
 * A browser whose page answers every in-page request through `handler`.
 *
 * @param {(url: string) => {status: number, body: string}} handler
 * @returns {{browser: any, requests: string[], gotos: string[]}}
 */
function fakeBrowser(handler) {
  const requests = [];
  const gotos = [];
  const page = {
    isClosed: () => false,
    goto: async (url) => {
      gotos.push(String(url));
    },
    waitForFunction: async () => {},
    close: async () => {},
    evaluate: async (fn, ...args) => {
      const original = globalThis.fetch;
      globalThis.fetch = async (url) => {
        requests.push(String(url));
        const { status, body } = handler(String(url));
        return { status, text: async () => body, json: async () => JSON.parse(body) };
      };
      try {
        return await fn(...args);
      } finally {
        globalThis.fetch = original;
      }
    },
  };
  return { browser: { newPage: async () => page }, requests, gotos };
}

/**
 * immowelt and SeLoger are one application behind one DataDome wall, and they are asked about
 * their adverts the only way that wall lets through: from inside the session each run warms.
 */
describe('#platform providers', () => {
  it.each([
    ['immowelt', immowelt],
    ['seloger', seloger],
  ])('%s asks about its adverts in the browser session, not with a plain request', (_, provider) => {
    expect(provider.config.activityProbe).toBeUndefined();
    expect(provider.config.browserActivityProbe).toBeTypeOf('function');
    expect(Object.keys(provider.config.priceTracking)).toEqual(['browserProbe']);
  });

  it('reads a taken-down SeLoger advert as gone', async () => {
    const { browser, gotos } = fakeBrowser(() => ({ status: 410, body: '<html>gone</html>' }));

    expect(await seloger.config.browserActivityProbe(SELOGER_LINK, browser)).toBe(0);
    expect(gotos).toEqual(['https://www.seloger.com/']);
  });

  it("reads a SeLoger advert's current price, the figure the search stored", async () => {
    const { browser } = fakeBrowser(() => ({ status: 200, body: SELOGER_EXPOSE }));

    expect(await seloger.config.priceTracking.browserProbe({ link: SELOGER_LINK }, browser)).toBe(1190);
  });

  // The shared BFF would search the other portal's url without complaint, and store its flats under
  // the wrong provider.
  it("refuses the other portal's search urls before asking anything", async () => {
    const { browser, requests } = fakeBrowser(() => ({ status: 200, body: '{}' }));

    await expect(
      immowelt.config.getListings('https://www.seloger.com/classified-search?locations=AD08FR31096', browser),
    ).rejects.toThrow(/Immowelt serves immowelt\.de and immowelt\.at/);
    await expect(
      seloger.config.getListings('https://www.immowelt.de/classified-search?locations=AD08DE8634', browser),
    ).rejects.toThrow(/SeLoger serves seloger\.com/);
    expect(requests).toEqual([]);
  });

  it("refuses SeLoger's landing pages, whose search sits in the path", async () => {
    const { browser } = fakeBrowser(() => ({ status: 200, body: '{}' }));

    await expect(
      seloger.config.getListings('https://www.seloger.com/recherche/location/appartement/france/ad02fr1', browser),
    ).rejects.toThrow(/landing pages/);
  });

  it('binds each run its own url and blacklist', () => {
    const first = seloger.createConfig({ url: 'https://www.seloger.com/classified-search?a=1', enabled: true }, [
      'viager',
    ]);
    const second = seloger.createConfig({ url: 'https://www.seloger.com/classified-search?b=2', enabled: true }, []);

    expect(first.url).not.toBe(second.url);
    expect(first.filter({ title: 'Viager occupé', description: '' })).toBe(false);
    expect(second.filter({ title: 'Viager occupé', description: '' })).toBe(true);
  });
});
