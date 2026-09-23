/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const loggerPath = root + '/lib/services/logger.js';

let state;

/**
 * The Austrian client with the network replaced by a router over the requested theme.
 *
 * @returns {Promise<any>}
 */
async function loadClient() {
  vi.resetModules();
  vi.doMock('node-fetch', () => ({
    default: async (url, options) => {
      state.requests.push({ url: String(url), options });
      const theme = new URL(String(url)).searchParams.get('thema');
      const answer = state.answers[theme];
      if (answer === 'boom') {
        return { ok: false, status: 503, statusText: 'Service Unavailable' };
      }
      return { ok: true, status: 200, json: async () => answer };
    },
  }));
  vi.doMock('p-throttle', () => ({ default: () => (fn) => fn }));
  vi.doMock(loggerPath, () => ({ default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } }));
  return import(root + '/lib/services/connectivity/client/breitbandatlasAtClient.js');
}

/** A cell the register knows, with one provider in it. */
const cell = (entry) => ({ data: { anbieter: [entry] } });

describe('services/connectivity/breitbandatlasAtClient lookups', () => {
  beforeEach(() => {
    state = { requests: [], answers: {} };
  });

  /**
   * Half an answer stored as the answer would be stamped for the next 180 days: "no mobile data"
   * for a place whose mobile request merely failed. The Spanish client already refuses that.
   */
  it('returns nothing rather than half an answer when the second request fails', async () => {
    const client = await loadClient();
    // The fixed-line register answers, the mobile one is down.
    state.answers = { Festnetz: cell({ name: 'A1', technik: 'ftth', down: 1000 }), Mobilfunknetz: 'boom' };

    const result = await client.fetchAustrianConnectivity(48.2085, 16.3738);

    expect(result).toBeNull();
    expect(client.isBreitbandatlasAtPaused()).toBe(true);
  });

  // node-fetch 3 dropped its `timeout` option and ignores it; only an abort signal ends a request
  // that a stalled backend never answers.
  it('gives every request a signal that ends it', async () => {
    const client = await loadClient();
    state.answers = { Festnetz: { data: { anbieter: [] } }, Mobilfunknetz: { data: { anbieter: [] } } };

    await client.fetchAustrianConnectivity(48.2085, 16.3738);

    expect(state.requests.length).toBeGreaterThan(0);
    for (const request of state.requests) {
      expect(request.options?.signal).toBeInstanceOf(AbortSignal);
      expect(request.options).not.toHaveProperty('timeout');
    }
  });
});
