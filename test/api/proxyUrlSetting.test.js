/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

const root = (await import('node:path')).resolve('.');

let upserted;

/**
 * Register the settings plugin against a fastify double and return its POST handler.
 *
 * @returns {Promise<(request: any, reply: any) => Promise<any>>}
 */
async function loadPostHandler() {
  upserted = [];
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => ({ demoMode: false }),
    getPublicSettings: async () => ({}),
    upsertSettings: (settings) => upserted.push(settings),
  }));
  vi.doMock(root + '/lib/api/security.js', () => ({ isAdmin: () => true }));
  vi.doMock(root + '/lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
  vi.doMock(root + '/lib/services/storage/userStorage.js', () => ({ ensureDemoUserExists: vi.fn() }));
  const utils = await vi.importActual(root + '/lib/utils.js');
  vi.doMock(root + '/lib/utils.js', () => ({ ...utils, updateConfigOnDisk: vi.fn() }));

  const plugin = (await import(root + '/lib/api/routes/generalSettingsRoute.js')).default;
  const routes = {};
  await plugin({ get: () => {}, post: (path, handler) => (routes[`POST ${path}`] = handler) });
  return routes['POST /'];
}

/** A reply double that records what the handler answered. */
function replyDouble() {
  const recorded = { status: 200, payload: undefined };
  return {
    recorded,
    code(status) {
      recorded.status = status;
      return this;
    },
    send(payload) {
      recorded.payload = payload;
      return this;
    },
  };
}

/**
 * Since the proxy actually reaches Clearcote, a value Chromium cannot parse fails every request of
 * every job. The route is the place to say so, while the operator is still looking at the field.
 */
describe('proxyUrl setting', () => {
  async function post(body) {
    const handler = await loadPostHandler();
    const reply = replyDouble();
    await handler({ body }, reply);
    return reply.recorded;
  }

  it.each([
    'http://user:pass@proxy.example:8080',
    'https://proxy.example:443',
    'socks5://user:pass@proxy.example:1080',
    'socks4://proxy.example:1080',
  ])('stores %s', async (proxyUrl) => {
    const result = await post({ proxyUrl });

    expect(result.status).toBe(200);
    expect(upserted[0].proxyUrl).toBe(proxyUrl);
  });

  it('trims the value, since every launch reads it as stored', async () => {
    const result = await post({ proxyUrl: '  http://proxy.example:8080 \n' });

    expect(result.status).toBe(200);
    expect(upserted[0].proxyUrl).toBe('http://proxy.example:8080');
  });

  it('accepts an empty value, which turns the proxy off', async () => {
    const result = await post({ proxyUrl: '   ' });

    expect(result.status).toBe(200);
    expect(upserted[0].proxyUrl).toBe('');
  });

  it.each([
    ['credentials without a scheme', 'user:pass@proxy.example:8080'],
    ['a bare host and port', 'proxy.example:8080'],
    ['a scheme Chromium has no proxy for', 'ftp://proxy.example:21'],
    ['a scheme without a host', 'socks5://'],
    ['text that is no URL', 'my proxy'],
  ])('rejects %s', async (_label, proxyUrl) => {
    const result = await post({ proxyUrl });

    expect(result.status).toBe(400);
    expect(result.payload.error).toMatch(/proxyUrl must look like/);
    expect(upserted).toHaveLength(0);
  });

  it('leaves the setting untouched when the request does not mention it', async () => {
    const result = await post({ baseUrl: 'https://fredy.example' });

    expect(result.status).toBe(200);
    expect(upserted[0]).not.toHaveProperty('proxyUrl');
  });
});
