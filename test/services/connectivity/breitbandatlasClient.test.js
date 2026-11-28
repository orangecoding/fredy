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
      const answer = state.route?.(pathname) ?? state.answers[pathname];
      if (answer === undefined) {
        return { ok: false, status: 404, statusText: 'Not Found' };
      }
      if (answer === 'boom') {
        return { ok: false, status: 503, statusText: 'Service Unavailable' };
      }
      return { ok: true, status: 200, json: async () => answer };
    },
  }));
  vi.doMock('p-throttle', () => ({ default: () => (fn) => fn }));
  vi.doMock(loggerPath, () => ({ default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } }));
  return import(root + '/lib/services/connectivity/client/breitbandatlasClient.js');
}

const SERVICES = '/server/rest/services/Hosted';
const CONFIG = '/app/config/configLayerList.json';
const FIXED = `${SERVICES}/festnetz_015/FeatureServer/0/query`;
const MOBILE = `${SERVICES}/mobilfunk_013/FeatureServer/0/query`;

const fixedCell = { features: [{ attributes: { down_fn_hh_alle_1000: 100 } }] };
const mobileCell = { features: [{ attributes: { beste_tech: '5g', verf_5g: 1 } }] };

// What ArcGIS sends, inside a 200, for an edition that has been taken offline.
const serviceGone = { error: { code: 404, message: 'Service Hosted/mobilfunk_013/MapServer not found ', details: [] } };

describe('services/connectivity/breitbandatlasClient', () => {
  beforeEach(() => {
    state = { requests: [], answers: {}, route: null };
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

  // Half an answer would be stamped as the listing's answer for the whole retry interval: "no
  // mobile data" for a place whose mobile request merely failed. Austria and Spain refuse it too.
  it('returns nothing rather than half an answer when the mobile request fails', async () => {
    const client = await loadClient();
    state.answers = {
      [CONFIG]: { stationaryVersion: '015', mobileVersion: '013' },
      [FIXED]: fixedCell,
      [MOBILE]: 'boom',
    };

    const result = await client.fetchGermanConnectivity(52.52, 13.4);

    expect(result).toBeNull();
    expect(client.isBreitbandatlasPaused()).toBe(true);
  });

  // Read as an answer, the error has no features, so the cell came back "nothing known here" and
  // the sweep stamped the listing empty instead of trying again once the edition is sorted out.
  it('takes an ArcGIS error inside a 200 as a failure, not as an empty cell', async () => {
    const client = await loadClient();
    state.answers = {
      [CONFIG]: { stationaryVersion: '015', mobileVersion: '013' },
      [FIXED]: fixedCell,
      [MOBILE]: serviceGone,
    };

    const result = await client.fetchGermanConnectivity(52.52, 13.4);

    expect(result).toBeNull();
    expect(client.isBreitbandatlasPaused()).toBe(true);
  });

  // The configuration lives on the map's static host, not on the register. Failing to read it says
  // nothing about whether the register answers, which is what the built-in editions are there for.
  it('looks up with the built-in editions when the configuration cannot be read', async () => {
    const client = await loadClient();
    state.route = (pathname) => {
      if (pathname.includes('/festnetz_')) return fixedCell;
      if (pathname.includes('/mobilfunk_')) return mobileCell;
      return undefined;
    };

    const first = await client.fetchGermanConnectivity(52.52, 13.4);
    const second = await client.fetchGermanConnectivity(52.52, 13.4);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(client.isBreitbandatlasPaused()).toBe(false);
    // Asked again later, but not once per listing: a sweep of a few hundred would otherwise log
    // the same 404 a few hundred times.
    expect(state.requests.filter((p) => p === CONFIG)).toHaveLength(1);
  });
});
