/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const loggerPath = root + '/lib/services/logger.js';

let state;

/**
 * The German client with the network replaced by a router over the requested path.
 *
 * Anything the router does not know answers 404, the way the Breitbandatlas' nginx does for a file
 * that moved.
 *
 * @returns {Promise<any>}
 */
async function loadClient() {
  vi.resetModules();
  vi.doMock('node-fetch', () => ({
    default: async (url) => {
      const { pathname } = new URL(String(url));
      state.requests.push(pathname);
      const answer = state.answers[pathname];
      if (answer === undefined) {
        return { ok: false, status: 404, statusText: 'Not Found' };
      }
      return { ok: true, status: 200, json: async () => answer };
    },
  }));
  vi.doMock('p-throttle', () => ({ default: () => (fn) => fn }));
  vi.doMock(loggerPath, () => ({ default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } }));
  return import(root + '/lib/services/connectivity/client/breitbandatlasClient.js');
}

const SERVICES = '/server/rest/services/Hosted';

describe('services/connectivity/breitbandatlasClient', () => {
  beforeEach(() => {
    state = { requests: [], answers: {} };
  });

  // The data set moved its configuration from app/shared/config to app/config in November 2026.
  // The old path answers 404, which paused the client on every run and left it on stale editions.
  it('reads the current editions from where the Breitbandatlas publishes them', async () => {
    const client = await loadClient();
    state.answers = {
      '/app/config/configLayerList.json': { stationaryVersion: '015', mobileVersion: '013' },
      [`${SERVICES}/festnetz_015/FeatureServer/0/query`]: {
        features: [{ attributes: { down_fn_hh_alle_1000: 100 } }],
      },
      [`${SERVICES}/mobilfunk_013/FeatureServer/0/query`]: {
        features: [{ attributes: { beste_tech: '5g', verf_5g: 1 } }],
      },
    };

    const result = await client.fetchGermanConnectivity(52.52, 13.4);

    expect(client.isBreitbandatlasPaused()).toBe(false);
    expect(state.requests).toEqual([
      '/app/config/configLayerList.json',
      `${SERVICES}/festnetz_015/FeatureServer/0/query`,
      `${SERVICES}/mobilfunk_013/FeatureServer/0/query`,
    ]);
    expect(result).not.toBeNull();
  });
});
