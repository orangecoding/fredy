/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const storagePath = root + '/lib/services/storage/listingsStorage.js';
const settingsPath = root + '/lib/services/storage/settingsStorage.js';
const puppeteerPath = root + '/lib/services/extractor/puppeteerExtractor.js';
const historyPath = root + '/lib/services/listings/priceHistoryService.js';
const utilsPath = root + '/lib/utils.js';
const loggerPath = root + '/lib/services/logger.js';

let state;

/**
 * Load the price tracker with everything that leaves the process replaced.
 *
 * @returns {Promise<Function>} runPriceTracker
 */
async function loadService() {
  vi.resetModules();
  vi.doMock(storagePath, () => ({
    PRICE_CHECK_STALE_MS: 604800000,
    getListingsDueForPriceCheck: ({ limit }) => state.due.slice(0, limit),
    markListingsPriceChecked: (ids) => state.marked.push(...ids),
  }));
  vi.doMock(settingsPath, () => ({ getSettings: async () => state.settings }));
  vi.doMock(puppeteerPath, () => ({
    default: async (url) => {
      state.rendered.push(url);
      state.concurrent += 1;
      state.maxConcurrent = Math.max(state.maxConcurrent, state.concurrent);
      await new Promise((resolve) => setTimeout(resolve, 1));
      state.concurrent -= 1;
      return state.html[url] ?? null;
    },
    launchBrowser: async () => {
      state.launches += 1;
      return { id: 'browser' };
    },
    closeBrowser: async () => {
      state.closes += 1;
    },
  }));
  vi.doMock(historyPath, () => ({
    getThresholdPercent: async () => 1,
    recordPriceChange: (listing, price) => {
      state.recorded.push([listing.id, price]);
      return state.changeFor(listing, price);
    },
    notifyPriceChanges: async (changes) => state.notified.push(...changes),
  }));
  vi.doMock(utilsPath, async (importOriginal) => ({
    ...(await importOriginal()),
    getProviders: async () => state.providers,
  }));
  vi.doMock(loggerPath, () => ({
    default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  }));
  return (await import(root + '/lib/services/listings/priceTrackingService.js')).default;
}

const listing = (id, provider = 'immowelt') => ({
  id,
  link: `https://example.com/${id}`,
  provider,
  price: 1200,
  job_id: 'job1',
});

/** A provider whose price sits in the markup, read through the shared selector path. */
const markupProvider = {
  metaInformation: { id: 'immowelt' },
  config: { priceTracking: { selector: '.price | trim' } },
};

beforeEach(() => {
  state = {
    due: [],
    marked: [],
    rendered: [],
    recorded: [],
    notified: [],
    html: {},
    launches: 0,
    closes: 0,
    concurrent: 0,
    maxConcurrent: 0,
    providers: [markupProvider],
    settings: { priceTrackingEnabled: true, priceCheckIntervalDays: 7, priceCheckLimitPerRun: 100 },
    changeFor: () => null,
  };
});

describe('services/listings/priceTrackingService', () => {
  it('does nothing at all while the setting is off', async () => {
    state.settings.priceTrackingEnabled = false;
    state.due = [listing('a')];
    const run = await loadService();

    await run();

    expect(state.launches).toBe(0);
    expect(state.rendered).toHaveLength(0);
    expect(state.marked).toHaveLength(0);
  });

  it('reads the price off a rendered page and hands it to the recorder', async () => {
    state.due = [listing('a')];
    state.html['https://example.com/a'] = '<html><body><div class="price">1.100 €</div></body></html>';
    const run = await loadService();

    await run();

    expect(state.recorded).toEqual([['a', 1100]]);
  });

  // puppeteerExtractor answers null both for a bot wall and for a navigation failure. Either way we
  // do not know the price, and "do not know" must never reach the recorder as a number.
  it('records nothing when the page comes back empty, but still marks the listing checked', async () => {
    state.due = [listing('a')];
    state.html['https://example.com/a'] = null;
    const run = await loadService();

    await run();

    expect(state.recorded).toHaveLength(0);
    // Without this the listing is due again on the very next run and eats the whole budget forever.
    expect(state.marked).toEqual(['a']);
  });

  it('marks a listing checked even when the page renders without a price', async () => {
    state.due = [listing('a')];
    state.html['https://example.com/a'] = '<html><body>no price here</body></html>';
    const run = await loadService();

    await run();

    expect(state.recorded).toHaveLength(0);
    expect(state.marked).toEqual(['a']);
  });

  it('honours the configured per-run limit', async () => {
    state.settings.priceCheckLimitPerRun = 2;
    state.due = [listing('a'), listing('b'), listing('c')];
    const run = await loadService();

    await run();

    expect(state.rendered).toHaveLength(2);
  });

  it('never renders more pages at once than the concurrency allows', async () => {
    state.due = ['a', 'b', 'c', 'd', 'e'].map((id) => listing(id));
    const run = await loadService();

    await run({ concurrency: 2 });

    expect(state.maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('opens one browser for the whole run and closes it', async () => {
    state.due = [listing('a'), listing('b')];
    state.html['https://example.com/a'] = '<div class="price">1.100 €</div>';
    state.html['https://example.com/b'] = '<div class="price">900 €</div>';
    const run = await loadService();

    await run();

    expect(state.launches).toBe(1);
    expect(state.closes).toBe(1);
  });

  // A leaked browser on the error path leaves a Chromium process behind on every failed run.
  it('closes the browser even when a probe throws', async () => {
    state.due = [listing('a')];
    state.providers = [
      {
        metaInformation: { id: 'immowelt' },
        config: {
          priceTracking: {
            extract: () => {
              throw new Error('parser exploded');
            },
          },
        },
      },
    ];
    state.html['https://example.com/a'] = '<div class="price">1.100 €</div>';
    const run = await loadService();

    await run();

    expect(state.closes).toBe(1);
    expect(state.recorded).toHaveLength(0);
  });

  // A provider reading its price from an API must not drag a browser along for the ride.
  it('never launches a browser when every provider answers through probe', async () => {
    state.due = [listing('a', 'immoscout')];
    state.providers = [
      {
        metaInformation: { id: 'immoscout' },
        config: { priceTracking: { probe: async () => '1.100 €' } },
      },
    ];
    const run = await loadService();

    await run();

    expect(state.launches).toBe(0);
    expect(state.rendered).toHaveLength(0);
    expect(state.recorded).toEqual([['a', 1100]]);
  });

  it('skips listings whose provider has no price extractor', async () => {
    state.due = [listing('a', 'unknown')];
    const run = await loadService();

    await run();

    expect(state.launches).toBe(0);
    expect(state.marked).toHaveLength(0);
  });

  it('passes the changes it collected on to be notified', async () => {
    state.due = [listing('a')];
    state.html['https://example.com/a'] = '<div class="price">1.100 €</div>';
    state.changeFor = (l, price) => ({ listing: l, oldPrice: 1200, newPrice: price, direction: 'down' });
    const run = await loadService();

    await run();

    expect(state.notified).toHaveLength(1);
  });
});
