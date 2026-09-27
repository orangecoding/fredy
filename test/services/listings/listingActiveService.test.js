/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const storagePath = root + '/lib/services/storage/listingsStorage.js';
const settingsPath = root + '/lib/services/storage/settingsStorage.js';
const puppeteerPath = root + '/lib/services/extractor/puppeteerExtractor.js';
const utilsPath = root + '/lib/utils.js';
const loggerPath = root + '/lib/services/logger.js';

let state;

/**
 * Load the alive-checker with its storage, provider lookup and browser replaced.
 *
 * @param {(link: string) => number} [activityProbe] The provider probe. Defaults to "still online".
 * @param {object} [config] The provider config, when a test needs more than the plain probe.
 * @returns {Promise<Function>} runActiveChecker
 */
async function loadService(activityProbe = (link) => state.testerResults[link] ?? 1, config = { activityProbe }) {
  vi.resetModules();
  vi.doMock(settingsPath, () => ({ getSettings: async () => state.settings }));
  vi.doMock(puppeteerPath, () => ({
    launchBrowser: async (url, options) => {
      state.launches.push(options);
      if (state.launchFails) throw new Error('Chromium would not start');
      return state.browser;
    },
    closeBrowser: async (browser) => {
      state.closed.push(browser);
    },
  }));
  vi.doMock(storagePath, () => ({
    getListingsDueForActiveCheck: () => state.due,
    deactivateListings: (ids) => state.deactivated.push(...ids),
    markListingsChecked: (ids) => state.marked.push(...ids),
    recordActiveCheckFailures: (ids) => {
      state.failuresRecorded.push(...ids);
      return state.exhausted;
    },
  }));
  vi.doMock(utilsPath, async (importOriginal) => ({
    // Partial mock: only the provider lookup is faked. `mapLimit` is the real concurrency helper,
    // and substituting it would mean these tests no longer exercise the scheduling the service
    // actually runs on.
    ...(await importOriginal()),
    getProviders: async () => [{ metaInformation: { id: 'immowelt' }, config }],
  }));
  vi.doMock(loggerPath, () => ({
    default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  }));
  return (await import(root + '/lib/services/listings/listingActiveService.js')).default;
}

const listing = (id) => ({ id, link: `https://example.com/${id}`, provider: 'immowelt' });

/**
 * The two outcomes that matter for retention: a listing the portal reports as gone starts its grace
 * period straight away, while a probe that never answers only counts towards a streak - a blocked IP
 * must not be read as "this flat is gone".
 */
describe('services/listings/listingActiveService', () => {
  beforeEach(() => {
    state = {
      due: [],
      testerResults: {},
      deactivated: [],
      marked: [],
      failuresRecorded: [],
      exhausted: [],
      settings: {},
      browser: { id: 'browser' },
      launches: [],
      closed: [],
      launchFails: false,
    };
  });

  it('deactivates a listing the provider reports as gone', async () => {
    state.due = [listing('gone')];
    state.testerResults['https://example.com/gone'] = 0;
    const runActiveChecker = await loadService();

    await runActiveChecker();

    expect(state.deactivated).toEqual(['gone']);
    expect(state.marked).toEqual(['gone']);
    expect(state.failuresRecorded).toEqual([]);
  });

  it('leaves a listing that is still online alone', async () => {
    state.due = [listing('alive')];
    const runActiveChecker = await loadService();

    await runActiveChecker();

    expect(state.deactivated).toEqual([]);
    expect(state.marked).toEqual(['alive']);
  });

  it('counts a failed probe instead of marking the listing as checked', async () => {
    // markListingsChecked would clear the streak, which is exactly what a failed probe must not do.
    state.due = [listing('blocked')];
    state.testerResults['https://example.com/blocked'] = -1;
    const runActiveChecker = await loadService();

    await runActiveChecker();

    expect(state.failuresRecorded).toEqual(['blocked']);
    expect(state.marked).toEqual([]);
    expect(state.deactivated).toEqual([]);
  });

  it('counts a probe that threw as a failure', async () => {
    // A thrown error is the common shape of a dropped connection or a blocked address.
    state.due = [listing('boom')];
    const runActiveChecker = await loadService(() => {
      throw new Error('ECONNRESET');
    });

    await runActiveChecker();

    expect(state.failuresRecorded).toEqual(['boom']);
    expect(state.marked).toEqual([]);
    expect(state.deactivated).toEqual([]);
  });

  it('deactivates a listing whose failure streak reached the limit', async () => {
    state.due = [listing('hopeless')];
    state.testerResults['https://example.com/hopeless'] = -1;
    state.exhausted = ['hopeless'];
    const runActiveChecker = await loadService();

    await runActiveChecker();

    // Enough failed probes in a row: the portal keeps refusing to answer, so the listing counts as
    // gone and its retention period starts.
    expect(state.deactivated).toEqual(['hopeless']);
  });

  it('keeps the two outcomes apart within one run', async () => {
    state.due = [listing('gone'), listing('alive'), listing('blocked')];
    state.testerResults['https://example.com/gone'] = 0;
    state.testerResults['https://example.com/blocked'] = -1;
    const runActiveChecker = await loadService();

    await runActiveChecker();

    expect(state.deactivated).toEqual(['gone']);
    expect(state.marked.sort()).toEqual(['alive', 'gone']);
    expect(state.failuresRecorded).toEqual(['blocked']);
  });

  it('does nothing when no listing is due', async () => {
    const runActiveChecker = await loadService();

    await runActiveChecker();

    expect(state.deactivated).toEqual([]);
    expect(state.marked).toEqual([]);
    expect(state.failuresRecorded).toEqual([]);
  });

  /**
   * `concurrency` bounds the run as a whole, not any single portal. Listings arrive ordered by age
   * rather than by provider, so in practice all four parallel probes were regularly aimed at the
   * same host - which is what produced a burst of requests and a page of HTTP 429s back.
   */
  describe('per-host pacing', () => {
    const listingAt = (id, host) => ({ id, link: `https://${host}/expose/${id}`, provider: 'immowelt' });

    /** A probe that records how many of its own calls were ever in flight at once. */
    const trackingProbe = (durationMs = 5) => {
      const tracker = { inFlight: 0, peak: 0 };
      const probe = async () => {
        tracker.inFlight++;
        tracker.peak = Math.max(tracker.peak, tracker.inFlight);
        await new Promise((resolve) => setTimeout(resolve, durationMs));
        tracker.inFlight--;
        return 1;
      };
      return { tracker, probe };
    };

    it('never has two probes at one host in flight at the same time', async () => {
      state.due = [1, 2, 3, 4, 5, 6].map((n) => listingAt(`is24-${n}`, 'www.immobilienscout24.de'));
      const { tracker, probe } = trackingProbe();
      const runActiveChecker = await loadService(probe);

      await runActiveChecker({ hostGapMs: 0 });

      expect(tracker.peak).toBe(1);
      expect(state.marked).toHaveLength(6);
    });

    it('still probes different hosts in parallel', async () => {
      state.due = [1, 2, 3, 4].map((n) => listingAt(`listing-${n}`, `portal-${n}.example.com`));
      const { tracker, probe } = trackingProbe(20);
      const runActiveChecker = await loadService(probe);

      await runActiveChecker({ hostGapMs: 0 });

      // Serialising everything would make a 500-listing run needlessly long; only the per-host
      // burst was ever the problem.
      expect(tracker.peak).toBeGreaterThan(1);
    });

    it('leaves a gap between two probes at the same host', async () => {
      state.due = [1, 2, 3].map((n) => listingAt(`is24-${n}`, 'www.immobilienscout24.de'));
      const runActiveChecker = await loadService(() => 1);

      const startedAt = Date.now();
      await runActiveChecker({ hostGapMs: 100 });

      // Three probes means two gaps. Compared against a margin, not the exact figure, because the
      // assertion is "the run is paced", not "timers are precise".
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(150);
    });
  });

  // immowelt, SeLoger and leboncoin answer node with a DataDome 403 whether an advert is online or
  // not; only a browser session gets a real answer. The checker hands such a probe a browser of its
  // own, started for the run and only when a due listing needs one.
  describe('with a probe that needs a browser', () => {
    const browserConfig = () => ({
      browserActivityProbe: async (link, browser) => {
        state.probedWith = [...(state.probedWith ?? []), browser];
        return state.testerResults[link] ?? 1;
      },
    });

    it('asks it with the browser it started for the run, and closes that browser', async () => {
      state.due = [listing('alive'), listing('gone')];
      state.testerResults['https://example.com/gone'] = 0;
      const runActiveChecker = await loadService(undefined, browserConfig());

      await runActiveChecker();

      expect(state.launches).toHaveLength(1);
      expect(state.probedWith).toEqual([state.browser, state.browser]);
      expect(state.closed).toEqual([state.browser]);
      expect(state.deactivated).toEqual(['gone']);
      expect(state.marked.sort()).toEqual(['alive', 'gone']);
    });

    it('starts no browser for a run whose probes need none', async () => {
      state.due = [listing('alive')];
      const runActiveChecker = await loadService();

      await runActiveChecker();

      expect(state.launches).toHaveLength(0);
      expect(state.closed).toHaveLength(0);
    });

    it('starts the browser behind the configured proxy, like every other browser', async () => {
      state.due = [listing('alive')];
      state.settings = { proxyUrl: 'http://proxy.example:8080' };
      const runActiveChecker = await loadService(undefined, browserConfig());

      await runActiveChecker();

      expect(state.launches[0]).toMatchObject({ proxyUrl: 'http://proxy.example:8080' });
    });

    it('closes the browser when a probe throws, and counts the throw as a failure', async () => {
      state.due = [listing('boom')];
      const runActiveChecker = await loadService(undefined, {
        browserActivityProbe: async () => {
          throw new Error('Target closed');
        },
      });

      await runActiveChecker();

      expect(state.closed).toEqual([state.browser]);
      expect(state.failuresRecorded).toEqual(['boom']);
    });

    it('counts the listings as unanswered when the browser will not start', async () => {
      state.due = [listing('a')];
      state.launchFails = true;
      const runActiveChecker = await loadService(undefined, browserConfig());

      await runActiveChecker();

      expect(state.failuresRecorded).toEqual(['a']);
      expect(state.deactivated).toEqual([]);
    });
  });
});
