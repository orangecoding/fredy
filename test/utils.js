/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi } from 'vitest';
import { readFile } from 'fs/promises';
import * as mockStore from './mocks/mockStore.js';
import { send } from './mocks/mockNotification.js';

export const providerConfig = JSON.parse(
  await readFile(new URL('./provider/testProvider.json', import.meta.url), 'utf-8'),
);

export const sseEvents = [];

vi.mock('../lib/services/storage/listingsStorage.js', () => mockStore);
vi.mock('../lib/services/storage/settingsStorage.js', () => mockStore);
vi.mock('../lib/services/geocoding/geoCodingService.js', () => ({
  geocodeAddress: mockStore.geocodeAddress,
}));
vi.mock('../lib/services/storage/jobStorage.js', () => ({
  getJob: (jobKey) => ({ id: jobKey, userId: 'user1' }),
}));
vi.mock('../lib/services/sse/sse-broker.js', () => ({
  sendToUser: (userId, event, data) => {
    sseEvents.push({ userId, event, data });
  },
}));
vi.mock('../lib/notification/notify.js', () => ({ send }));

vi.mock('../lib/services/extractor/puppeteerExtractor.js', async (importOriginal) => {
  if (process.env.TEST_MODE !== 'offline') {
    return importOriginal();
  }
  const { readFixture } = await import('./offlineFixtures.js');
  return {
    // the options carry the provider's run name, which is the only way to map detail pages
    // that live on a partner domain back to their fixture
    default: (url, waitForSelector, options) => readFixture(url, options),
    launchBrowser: async () => ({ close: async () => {}, isConnected: () => true }),
    closeBrowser: async () => {},
  };
});

// Immowelt and SeLoger talk to their shared search BFF from inside the browser page (the only
// place a DataDome cookie is worth anything), so neither the extractor mock nor the fetch mock above
// can intercept it. The transport module is swapped out wholesale instead, serving the recording of
// whichever provider the request's site - or the exposé link's site - belongs to. A link on no site
// of the platform gets nothing, exactly as production fetches nothing for it.
vi.mock('../lib/services/immowelt/immoweltBff.js', async (importOriginal) => {
  if (process.env.TEST_MODE !== 'offline') {
    return importOriginal();
  }
  const { readClassifiedFixtures } = await import('./offlineFixtures.js');
  const { siteOf } = await import('../lib/services/immowelt/site.js');
  return {
    IMMOWELT_ORIGIN: 'https://www.immowelt.de',
    searchClassifieds: async (_browser, _request, site) => (await readClassifiedFixtures(site?.provider)).classifieds,
    fetchExposeHtml: async (_browser, link) => {
      const site = siteOf(link);
      return site == null ? null : (await readClassifiedFixtures(site.provider)).detailHtml;
    },
    // Offline there is no portal to ask, which is the "no answer" the probe contract has for it.
    probeExpose: async () => -1,
    releaseSession: async () => {},
    resolveSearchAreas: async (_browser, request) => request,
  };
});

// leboncoin's finder endpoint is asked from inside the browser page for the same reason.
vi.mock('../lib/services/leboncoin/finder.js', async (importOriginal) => {
  if (process.env.TEST_MODE !== 'offline') {
    return importOriginal();
  }
  const { readLeboncoinFixtures } = await import('./offlineFixtures.js');
  return {
    searchAds: async () => readLeboncoinFixtures(),
    releaseSession: async () => {},
  };
});

// Offline runs replace browser navigation with the recorded result page.
vi.mock('../lib/services/idealista/idealistaSearch.js', async (importOriginal) => {
  if (process.env.TEST_MODE !== 'offline') {
    return importOriginal();
  }
  const { readFixture } = await import('./offlineFixtures.js');
  return { fetchSearchHtml: async (url) => readFixture(url) };
});

if (process.env.TEST_MODE === 'offline') {
  const { buildFetchMock } = await import('./offlineFixtures.js');
  vi.stubGlobal('fetch', buildFetchMock());
}

/**
 * The pipeline, with the detail-page enrichment capped at one listing.
 *
 * The cap used to live in the pipeline itself as `process.env.NODE_ENV === 'test'`. It belongs
 * here: a fixture run only needs to prove the enrichment path works once, and walking every
 * listing's detail page makes the provider suites slow (and, in live mode, rude).
 *
 * @returns {Promise<typeof import('../lib/FredyPipelineExecutioner.js').default>} A subclass that
 *   applies the cap, so the tests can keep constructing it with the production signature.
 */
export const mockFredy = async () => {
  const mod = await import('../lib/FredyPipelineExecutioner.js');
  const FredyPipelineExecutioner = mod.default;
  return class TestPipeline extends FredyPipelineExecutioner {
    constructor(providerConfig, job, providerId, similarityCache, browser, options = {}) {
      super(providerConfig, job, providerId, similarityCache, browser, { maxDetailFetches: 1, ...options });
    }
  };
};
