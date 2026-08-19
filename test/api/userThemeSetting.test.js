/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TRACKING_POIS } from '../../lib/TRACKING_POIS.js';

const root = (await import('node:path')).resolve('.');

/** @type {Array<{settings: Record<string, any>, userId: string|null}>} */
let upserted;
/** @type {string[]} */
let tracked;

/**
 * Register the user-settings plugin against a fastify double and return the theme handler.
 *
 * @param {Record<string, any>} [stored={}] What the calling user already had saved.
 * @returns {Promise<(request: any, reply: any) => Promise<any>>}
 */
async function loadThemeHandler(stored = {}) {
  upserted = [];
  tracked = [];
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => ({ demoMode: false }),
    getUserSettings: () => stored,
    getAddresses: () => [],
    upsertSettings: (settings, userId = null) => upserted.push({ settings, userId }),
  }));
  vi.doMock(root + '/lib/api/security.js', () => ({ isAdmin: () => true }));
  vi.doMock(root + '/lib/services/tracking/Tracker.js', () => ({
    trackPoi: async (poi) => tracked.push(poi),
  }));
  vi.doMock(root + '/lib/services/geocoding/geoCodingService.js', () => ({ geocodeAddress: vi.fn() }));
  vi.doMock(root + '/lib/services/geocoding/autocompleteService.js', () => ({ autocompleteAddress: vi.fn() }));
  vi.doMock(root + '/lib/services/geocoding/distanceService.js', () => ({
    updateDistancesForAddressChange: vi.fn(),
  }));
  vi.doMock(root + '/lib/services/crons/geocoding-cron.js', () => ({ runGeoCordTask: vi.fn() }));

  const plugin = (await import(root + '/lib/api/routes/userSettingsRoute.js')).default;
  const routes = {};
  await plugin({ get: () => {}, post: (path, handler) => (routes[`POST ${path}`] = handler) });
  return routes['POST /theme'];
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

describe('POST /api/user/settings/theme', () => {
  /** @type {(request: any, reply: any) => Promise<any>} */
  let handler;

  beforeEach(async () => {
    handler = await loadThemeHandler();
  });

  /**
   * Post a theme on behalf of a user who already has `stored` saved.
   *
   * @param {string|undefined} theme
   * @param {Record<string, any>} [stored={}]
   * @returns {Promise<{status: number}>}
   */
  async function post(theme, stored = {}) {
    handler = await loadThemeHandler(stored);
    const reply = replyDouble();
    await handler({ session: { currentUser: 'user-1' }, body: { theme } }, reply);
    return reply.recorded;
  }

  it.each(['dark', 'light'])('stores %s against the calling user', async (theme) => {
    const reply = replyDouble();
    const result = await handler({ session: { currentUser: 'user-1' }, body: { theme } }, reply);

    expect(result).toEqual({ success: true });
    expect(upserted).toEqual([{ settings: { theme }, userId: 'user-1' }]);
  });

  it.each([['sepia'], [''], [null], [undefined], [42], ['DARK']])(
    'rejects %s, because the value ends up on an attribute with only two palettes behind it',
    async (theme) => {
      const reply = replyDouble();
      await handler({ session: { currentUser: 'user-1' }, body: { theme } }, reply);

      expect(reply.recorded.status).toBe(400);
      expect(upserted).toEqual([]);
    },
  );

  it('ignores a userId in the body and writes only the session own preference', async () => {
    const reply = replyDouble();
    await handler({ session: { currentUser: 'user-2' }, body: { theme: 'light', userId: 'user-1' } }, reply);

    expect(upserted).toEqual([{ settings: { theme: 'light' }, userId: 'user-2' }]);
  });

  it('reports which theme was switched to, not merely that the setting was touched', async () => {
    await post('light', { theme: 'dark' });
    expect(tracked).toEqual([TRACKING_POIS.CHANGE_THEME_LIGHT]);

    await post('dark', { theme: 'light' });
    expect(tracked).toEqual([TRACKING_POIS.CHANGE_THEME_DARK]);
  });

  it('counts a first-ever choice of light, since the account was on the dark default', async () => {
    await post('light', {});
    expect(tracked).toEqual([TRACKING_POIS.CHANGE_THEME_LIGHT]);
  });

  it('does not count re-saving the theme the user is already on', async () => {
    // Including the first-ever save of `dark`, which repaints nothing: the account was already
    // being shown the dark default. A count of switches has to mean switches.
    await post('dark', {});
    expect(tracked).toEqual([]);

    await post('light', { theme: 'light' });
    expect(tracked).toEqual([]);
  });

  it('tracks nothing at all when the value was rejected', async () => {
    const recorded = await post('sepia', { theme: 'dark' });
    expect(recorded.status).toBe(400);
    expect(tracked).toEqual([]);
  });
});
