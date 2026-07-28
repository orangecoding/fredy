/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

/**
 * A full global settings row set, as `getSettings()` would compile it: operator configuration,
 * the two flags the whole UI needs, and the session signing secret that must never leave the
 * process.
 */
const STORED_SETTINGS = {
  demoMode: false,
  analyticsEnabled: true,
  interval: 60,
  port: 9998,
  baseUrl: 'https://fredy.example',
  sessionTTL: 4,
  sqlitepath: '/db',
  proxyUrl: 'http://user:hunter2@proxy.example:8080',
  workingHours: { from: '08:00', to: '20:00' },
  session_secret: 'super-secret-signing-key',
};

const settingsRows = Object.entries(STORED_SETTINGS).map(([name, value]) => ({
  name,
  value: JSON.stringify(value),
}));

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: { query: () => settingsRows, execute: () => ({ changes: 1 }) },
}));
vi.mock('../../lib/utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  readConfigFromStorage: async () => ({ sqlitepath: '/db' }),
}));

const { getSettings, getPublicSettings } = await import('../../lib/services/storage/settingsStorage.js');

describe('settings exposure', () => {
  describe('getPublicSettings', () => {
    it('drops the session secret', async () => {
      const published = await getPublicSettings();
      expect(published).not.toHaveProperty('session_secret');
    });

    it('keeps every non-secret setting', async () => {
      const published = await getPublicSettings();
      for (const name of Object.keys(STORED_SETTINGS)) {
        if (name === 'session_secret') continue;
        expect(published[name]).toEqual(STORED_SETTINGS[name]);
      }
    });

    it('leaves getSettings untouched, so server-side callers still see the secret', async () => {
      const internal = await getSettings();
      expect(internal.session_secret).toBe('super-secret-signing-key');
    });

    it('returns a copy, so a caller cannot mutate the settings cache', async () => {
      const published = await getPublicSettings();
      published.demoMode = 'tampered';
      expect((await getSettings()).demoMode).toBe(false);
    });
  });

  describe('GET /api/admin/generalSettings', () => {
    /**
     * Register the route plugin against a tiny fastify double and return the GET handler.
     * @param {boolean} isAdmin - What the security layer should report for the request.
     * @returns {Promise<(request: any) => Promise<Record<string, any>>>}
     */
    async function loadGetHandler(isAdmin) {
      vi.resetModules();
      vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
        default: { query: () => settingsRows, execute: () => ({ changes: 1 }) },
      }));
      vi.doMock('../../lib/utils.js', async (importOriginal) => ({
        ...(await importOriginal()),
        readConfigFromStorage: async () => ({ sqlitepath: '/db' }),
      }));
      vi.doMock('../../lib/api/security.js', () => ({ isAdmin: () => isAdmin }));
      vi.doMock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));

      const plugin = (await import('../../lib/api/routes/generalSettingsRoute.js')).default;
      const routes = {};
      await plugin({ get: (path, handler) => (routes[`GET ${path}`] = handler), post: () => {} });
      return routes['GET /'];
    }

    it('never returns the session secret, not even to an admin', async () => {
      const handler = await loadGetHandler(true);
      expect(await handler({})).not.toHaveProperty('session_secret');
    });

    it('gives an admin the operator configuration', async () => {
      const handler = await loadGetHandler(true);
      const payload = await handler({});
      expect(payload.proxyUrl).toBe(STORED_SETTINGS.proxyUrl);
      expect(payload.sqlitepath).toBe('/db');
      expect(payload.sessionTTL).toBe(4);
    });

    it('withholds operator configuration from a non-admin', async () => {
      const handler = await loadGetHandler(false);
      const payload = await handler({});
      for (const secret of ['proxyUrl', 'sqlitepath', 'sessionTTL', 'port', 'baseUrl', 'session_secret']) {
        expect(payload).not.toHaveProperty(secret);
      }
    });

    it('still gives a non-admin the flags the app needs to boot', async () => {
      const handler = await loadGetHandler(false);
      const payload = await handler({});
      // App.jsx gates the demo banner and the tracking consent modal on these two; the dashboard
      // renders the interval. Anything less and the UI breaks for regular users.
      expect(payload).toEqual({ demoMode: false, analyticsEnabled: true, interval: 60 });
    });
  });
});
