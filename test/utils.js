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

vi.mock('../lib/services/storage/listingsStorage.js', () => mockStore);
vi.mock('../lib/services/storage/settingsStorage.js', () => mockStore);
vi.mock('../lib/services/geocoding/geoCodingService.js', () => ({
  geocodeAddress: mockStore.getGeocoordinatesByAddress,
}));
vi.mock('../lib/services/storage/jobStorage.js', () => ({
  getJob: (jobKey) => ({ id: jobKey, userId: 'user1' }),
}));
vi.mock('../lib/notification/notify.js', () => ({ send }));

vi.mock('../lib/services/extractor/puppeteerExtractor.js', async (importOriginal) => {
  if (process.env.TEST_MODE !== 'offline') {
    return importOriginal();
  }
  const { readFixture } = await import('./offlineFixtures.js');
  return {
    default: (url) => readFixture(url),
    launchBrowser: async (url) => {
      const html = (await readFixture(url)) ?? '';
      // Extract __INITIAL_STATE__ so page.evaluate(() => window.__INITIAL_STATE__) works.
      const marker = html.includes('window.__INITIAL_STATE__ =')
        ? 'window.__INITIAL_STATE__ ='
        : 'window.__INITIAL_STATE__=';
      const markerIdx = html.indexOf(marker);
      let initialState = null;
      if (markerIdx !== -1) {
        const scriptEnd = html.indexOf('</script>', markerIdx);
        let jsonStr = (
          scriptEnd !== -1 ? html.slice(markerIdx + marker.length, scriptEnd) : html.slice(markerIdx + marker.length)
        ).trim();
        if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1);
        try {
          initialState = JSON.parse(jsonStr);
        } catch {
          initialState = null;
        }
      }
      const page = {
        goto: async () => {},
        url: () => url,
        content: async () => html,
        waitForFunction: async () => {},
        evaluate: async (fn) => {
          const src = fn.toString();
          if (src.includes('__INITIAL_STATE__')) return initialState;
          return fn();
        },
        close: async () => {},
      };
      return {
        newPage: async () => page,
        close: async () => {},
        isConnected: () => true,
      };
    },
    closeBrowser: async () => {},
  };
});

if (process.env.TEST_MODE === 'offline') {
  const { buildFetchMock } = await import('./offlineFixtures.js');
  vi.stubGlobal('fetch', buildFetchMock());
}

/**
 * @returns {Promise<typeof import('../lib/FredyPipelineExecutioner.js').default>}
 */
export const mockFredy = async () => {
  const mod = await import('../lib/FredyPipelineExecutioner.js');
  return mod.default;
};
