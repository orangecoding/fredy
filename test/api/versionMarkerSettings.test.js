/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

const root = (await import('node:path')).resolve('.');

/** @type {Array<{settings: Record<string, any>, userId: string|null}>} */
let upserted;

/**
 * Register the user-settings plugin against a fastify double and return its POST handlers.
 *
 * @param {{demoMode?: boolean, admin?: boolean}} [options]
 * @returns {Promise<Record<string, (request: any, reply: any) => Promise<any>>>}
 */
async function loadRoutes({ demoMode = false, admin = true } = {}) {
  upserted = [];
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => ({ demoMode }),
    getUserSettings: () => ({}),
    getAddresses: () => [],
    upsertSettings: (settings, userId = null) => upserted.push({ settings, userId }),
  }));
  vi.doMock(root + '/lib/api/security.js', () => ({ isAdmin: () => admin }));
  vi.doMock(root + '/lib/services/tracking/Tracker.js', () => ({ trackPoi: async () => {} }));
  vi.doMock(root + '/lib/services/geocoding/geoCodingService.js', () => ({ geocodeAddress: vi.fn() }));
  vi.doMock(root + '/lib/services/geocoding/autocompleteService.js', () => ({ autocompleteAddress: vi.fn() }));
  vi.doMock(root + '/lib/services/geocoding/distanceService.js', () => ({
    updateDistancesForAddressChange: vi.fn(),
  }));
  vi.doMock(root + '/lib/services/crons/geocoding-cron.js', () => ({ runGeoCordTask: vi.fn() }));

  const plugin = (await import(root + '/lib/api/routes/userSettingsRoute.js')).default;
  const routes = {};
  await plugin({ get: () => {}, post: (path, handler) => (routes[path] = handler) });
  return routes;
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
      return recorded;
    },
  };
}

const request = (body) => ({ session: { currentUser: 'user-1' }, body });

/**
 * The news after an upgrade and the toast announcing an available update each remember, per user,
 * the newest version they have already told about.
 */
describe.each([
  ['/news-last-seen-version', 'news_last_seen_version'],
  ['/update-notice-seen-version', 'update_notice_seen_version'],
])('POST %s', (path, name) => {
  it('stores the version for the user making the request', async () => {
    const routes = await loadRoutes();
    const result = await routes[path](request({ [name]: '30.1.1' }), replyDouble());
    expect(result).toEqual({ success: true });
    expect(upserted).toEqual([{ settings: { [name]: '30.1.1' }, userId: 'user-1' }]);
  });

  it('refuses anything that is not a short string', async () => {
    const routes = await loadRoutes();
    for (const value of [undefined, 30, 'x'.repeat(65)]) {
      const reply = replyDouble();
      await routes[path](request({ [name]: value }), reply);
      expect(reply.recorded.status).toBe(400);
    }
    expect(upserted).toEqual([]);
  });

  it('refuses a demo user', async () => {
    const routes = await loadRoutes({ demoMode: true, admin: false });
    const reply = replyDouble();
    await routes[path](request({ [name]: '30.1.1' }), reply);
    expect(reply.recorded.status).toBe(403);
    expect(upserted).toEqual([]);
  });
});
