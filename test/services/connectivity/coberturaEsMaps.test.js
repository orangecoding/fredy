/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');
const loggerPath = root + '/lib/services/logger.js';

let state;

/**
 * The Spanish client with the network replaced by a router over the request URL.
 *
 * `p-throttle` is mocked away as well. The real one spaces requests a second apart, which is right
 * against somebody else's service and pointless against a mock - four maps per lookup would
 * otherwise put seconds on the suite to prove nothing.
 *
 * @returns {Promise<any>}
 */
async function loadClient() {
  vi.resetModules();
  vi.doMock('node-fetch', () => ({
    default: async (url) => {
      state.requests.push(String(url));
      const answer = state.route(String(url));
      if (answer === 'boom') {
        return { ok: false, status: 503, statusText: 'Service Unavailable' };
      }
      return { ok: true, status: 200, json: async () => answer };
    },
  }));
  vi.doMock('p-throttle', () => ({ default: () => (fn) => fn }));
  vi.doMock(loggerPath, () => ({ default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } }));
  return import(root + '/lib/services/connectivity/client/coberturaEsClient.js');
}

/** The catalogue, as the organisation publishes it. */
const CATALOGUE = {
  services: [
    { name: 'CobBAFija_2023_vista', type: 'FeatureServer' },
    { name: 'CobBAFija_2024_vista', type: 'FeatureServer' },
    { name: 'CobFWA_2024_Vista', type: 'FeatureServer' },
    { name: 'InfoCob4G_2024', type: 'FeatureServer' },
    { name: 'InfoCob5G_2025', type: 'FeatureServer' },
    { name: 'Datos_Operadores_BA', type: 'FeatureServer' },
  ],
};

const features = (...attributes) => ({ features: attributes.map((a) => ({ attributes: a })) });

/**
 * The four maps behind a Spanish lookup.
 *
 * What is asserted here is mostly about what happens when one of them does not answer. That is not
 * hypothetical: the ministry's query backend was timing out on all four layers while this was
 * written, with the catalogue still replying in under a second, so a half-answer is the failure
 * mode this client actually meets.
 */
describe('services/connectivity/coberturaEsClient, over the four maps', () => {
  beforeEach(() => {
    state = {
      requests: [],
      route: (url) => {
        if (url.endsWith('/services?f=json')) return CATALOGUE;
        if (url.includes('CobBAFija') && url.endsWith('FeatureServer?f=json')) return { layers: [{ id: 17 }] };
        if (url.endsWith('FeatureServer?f=json')) return { layers: [{ id: 0 }] };
        if (url.includes('CobBAFija')) return features({ Velocidad: 1000, Cobertura: 'A1;FTTH;1000;X;NO' });
        if (url.includes('CobFWA')) return features();
        if (url.includes('InfoCob4G')) return features({ COBERTURA: 'A1;A2;A3' });
        if (url.includes('InfoCob5G')) return features({ COBERTURA: 'A1;A2' });
        return features();
      },
    };
  });

  const queries = () => state.requests.filter((url) => url.includes('/query?'));

  it('reads the current edition of each map and the layer it publishes', async () => {
    const client = await loadClient();

    const result = await client.fetchSpanishConnectivity(40.42, -3.7052);

    expect(result.maxDownMbit).toBe(1000);
    expect(result.fiber).toBe(true);
    expect(result.mobile.operatorCount).toBe(3);
    // The newest of the two published editions, at the layer index the service reports rather than
    // at the zero every other map happens to use.
    expect(queries().some((url) => url.includes('CobBAFija_2024_vista/FeatureServer/17/query'))).toBe(true);
    expect(queries().some((url) => url.includes('CobBAFija_2023'))).toBe(false);
  });

  it('spares the fixed-wireless map where a line already reaches the address', async () => {
    const client = await loadClient();

    await client.fetchSpanishConnectivity(40.42, -3.7052);

    expect(queries().some((url) => url.includes('CobFWA'))).toBe(false);
    expect(queries()).toHaveLength(3);
  });

  it('asks the fixed-wireless map where no line does', async () => {
    const wired = state.route;
    state.route = (url) => (url.includes('CobBAFija') && url.includes('/query?') ? features() : wired(url));
    const client = await loadClient();

    const result = await client.fetchSpanishConnectivity(42.35, -6.6);

    expect(queries().some((url) => url.includes('CobFWA'))).toBe(true);
    expect(result.maxDownMbit).toBeNull();
  });

  it('answers nothing at all rather than half an answer when one map is down', async () => {
    // The wired map answering and the 5G one timing out must not become "fibre, no 5G". The whole
    // lookup is dropped and the client left standing off, so the sweep comes back to the listing
    // instead of stamping a wrong answer onto it for half a year.
    const up = state.route;
    state.route = (url) => (url.includes('InfoCob5G') && url.includes('/query?') ? 'boom' : up(url));
    const client = await loadClient();

    expect(await client.fetchSpanishConnectivity(40.42, -3.7052)).toBeNull();
    expect(client.isCoberturaEsPaused()).toBe(true);
  });

  it('treats a 200 carrying an ArcGIS error as a failure, not as an empty place', async () => {
    // The service reports "Cannot perform query" with a 200 and an error object, which is what it
    // does under load. Read as an answer it would mean nobody has anything at this address.
    const up = state.route;
    state.route = (url) =>
      url.includes('/query?') ? { error: { code: 400, message: 'Cannot perform query.' } } : up(url);
    const client = await loadClient();

    expect(await client.fetchSpanishConnectivity(40.42, -3.7052)).toBeNull();
  });

  it('falls back to the built-in editions when the catalogue cannot be read', async () => {
    const up = state.route;
    state.route = (url) => (url.endsWith('/services?f=json') ? 'boom' : up(url));
    const client = await loadClient();

    // The catalogue failing is enough to stand the client off, so this lookup gives nothing - but
    // the fallback is what the next one runs on, rather than the country dropping out entirely.
    expect(await client.fetchSpanishConnectivity(40.42, -3.7052)).toBeNull();

    client.resetCoberturaEsClient();
    state.route = up;
    const result = await client.fetchSpanishConnectivity(40.42, -3.7052);

    expect(result.maxDownMbit).toBe(1000);
  });
});
