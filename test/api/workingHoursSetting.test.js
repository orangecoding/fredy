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
 * @param {boolean} [isAdmin=true]
 * @returns {Promise<(request: any, reply: any) => Promise<any>>}
 */
async function loadPostHandler(isAdmin = true) {
  upserted = [];
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => ({ demoMode: false }),
    getPublicSettings: async () => ({}),
    upsertSettings: (settings) => upserted.push(settings),
  }));
  vi.doMock(root + '/lib/api/security.js', () => ({ isAdmin: () => isAdmin }));
  vi.doMock(root + '/lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
  vi.doMock(root + '/lib/services/storage/userStorage.js', () => ({ ensureDemoUserExists: vi.fn() }));
  // The real isValidTimeZone: asking Intl whether a zone resolves needs no fixture, and it is the
  // behaviour under test.
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
 * The scheduler is deliberately lenient - it treats anything it cannot parse as "no window" and
 * runs. That makes the route the only place a bad value can still be reported, so a typo has to be
 * rejected here rather than stored and quietly ignored for weeks.
 */
describe('POST /api/admin/generalSettings - workingHours', () => {
  const post = async (body) => {
    const handler = await loadPostHandler();
    const reply = replyDouble();
    await handler({ body }, reply);
    return reply.recorded;
  };

  it('stores a window with a valid zone', async () => {
    const result = await post({ workingHours: { from: '10:00', to: '16:00', timeZone: 'Europe/Berlin' } });

    expect(result.status).toBe(200);
    expect(upserted[0].workingHours).toEqual({ from: '10:00', to: '16:00', timeZone: 'Europe/Berlin' });
  });

  it('accepts a window without a zone, which follows the server', async () => {
    const result = await post({ workingHours: { from: '10:00', to: '16:00', timeZone: null } });

    expect(result.status).toBe(200);
    expect(upserted[0].workingHours.timeZone).toBe(null);
  });

  it('accepts a cleared window', async () => {
    const result = await post({ workingHours: { from: '', to: '', timeZone: null } });

    expect(result.status).toBe(200);
  });

  it('rejects a zone the runtime cannot resolve', async () => {
    const result = await post({ workingHours: { from: '10:00', to: '16:00', timeZone: 'Mars/Olympus' } });

    expect(result.status).toBe(400);
    expect(result.payload.error).toMatch(/time zone/i);
    expect(upserted).toEqual([]);
  });

  it('accepts a legacy zone name that Intl still resolves', async () => {
    // Not every valid zone is in Intl.supportedValuesOf, and rejecting those would lock out
    // operators whose TZ has been US/Eastern for years.
    const result = await post({ workingHours: { from: '10:00', to: '16:00', timeZone: 'US/Eastern' } });

    expect(result.status).toBe(200);
  });

  it('rejects a malformed time', async () => {
    for (const from of ['1000', '25:00', '10:60', 'noon', '10:0']) {
      const result = await post({ workingHours: { from, to: '16:00' } });
      expect(result.status, from).toBe(400);
    }
  });

  it('rejects a half-configured window', async () => {
    const result = await post({ workingHours: { from: '10:00', to: '' } });

    expect(result.status).toBe(400);
    expect(result.payload.error).toMatch(/both/i);
  });

  it('rejects a value that is not an object', async () => {
    const result = await post({ workingHours: '10:00-16:00' });

    expect(result.status).toBe(400);
  });

  it('leaves the setting untouched when the request does not mention it', async () => {
    const result = await post({ proxyUrl: 'http://proxy.local' });

    expect(result.status).toBe(200);
    expect(upserted[0].workingHours).toBeUndefined();
  });
});
