/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import Fastify from 'fastify';

describe('api/routes/debugRouter.js', () => {
  let app;
  let state;

  beforeEach(async () => {
    state = {
      enabled: false,
      hasLogs: false,
      everEnabled: false,
      size: 0,
      max: 5 * 1024 * 1024,
    };

    const ROOT = path.resolve('.');
    const storagePath = path.join(ROOT, 'lib', 'services', 'debug', 'debugLogStorage.js');
    const bundlePath = path.join(ROOT, 'lib', 'services', 'debug', 'debugBundleService.js');
    const settingsStoragePath = path.join(ROOT, 'lib', 'services', 'storage', 'settingsStorage.js');

    const storageMock = {
      isEnabled: () => state.enabled,
      enableDebugLogging: async ({ clearPrevious = false } = {}) => {
        state.enabled = true;
        state.everEnabled = true;
        if (clearPrevious) {
          state.hasLogs = false;
          state.size = 0;
        }
      },
      disableDebugLogging: async () => {
        state.enabled = false;
      },
      getCurrentSize: async () => state.size,
      getMaxSize: () => state.max,
      hasAnyLogs: () => state.hasLogs,
      wasEverEnabled: async () => state.everEnabled,
      clearAllDebugLogs: () => {
        state.hasLogs = false;
        state.size = 0;
      },
    };

    const bundleMock = {
      buildDebugBundleFileName: async () => '2026-06-08-FredyDebug-22.5.0.zip',
      buildDebugBundleZip: async () => Buffer.from('FAKEZIP'),
    };

    const settingsMock = {
      getSettings: async () => ({ port: 9998 }),
    };

    vi.resetModules();
    vi.doMock(storagePath, () => storageMock);
    vi.doMock(bundlePath, () => bundleMock);
    vi.doMock(settingsStoragePath, () => settingsMock);

    const mod = await import(path.join(ROOT, 'lib', 'api', 'routes', 'debugRouter.js'));
    const plugin = mod.default;
    app = Fastify({ logger: false });
    await app.register(plugin, { prefix: '/api/admin/debug' });
    await app.register(
      async (sub) => {
        mod.registerDebugPublicProbe(sub);
      },
      { prefix: '/api/debug' },
    );
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('GET /status returns the current snapshot', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/debug/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      enabled: false,
      size: 0,
      max: state.max,
      hasLogs: false,
      everEnabled: false,
    });
  });

  it('POST /enable flips the feature on and returns updated status', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/debug/enable',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.enabled).toBe(true);
    expect(json.everEnabled).toBe(true);
  });

  it('POST /enable with clearPrevious=true wipes existing logs first', async () => {
    state.hasLogs = true;
    state.size = 1234;
    state.everEnabled = true;

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/debug/enable',
      payload: { clearPrevious: true },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.enabled).toBe(true);
    expect(json.hasLogs).toBe(false);
    expect(json.size).toBe(0);
  });

  it('POST /disable turns the feature off without losing existing logs', async () => {
    state.enabled = true;
    state.hasLogs = true;
    state.everEnabled = true;
    state.size = 99;

    const res = await app.inject({ method: 'POST', url: '/api/admin/debug/disable' });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.enabled).toBe(false);
    expect(json.hasLogs).toBe(true);
    expect(json.size).toBe(99);
  });

  it('GET /download returns 409 when the feature was never enabled', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/debug/download' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/never produced any data/i);
  });

  it('GET /download returns 409 when ever-enabled but no logs are stored', async () => {
    state.everEnabled = true;
    state.hasLogs = false;
    const res = await app.inject({ method: 'GET', url: '/api/admin/debug/download' });
    expect(res.statusCode).toBe(409);
  });

  it('GET /download streams a zip with the expected headers when logs exist', async () => {
    state.everEnabled = true;
    state.hasLogs = true;

    const res = await app.inject({ method: 'GET', url: '/api/admin/debug/download' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toContain('FredyDebug');
    expect(res.rawPayload.toString('utf-8')).toBe('FAKEZIP');
  });

  it('DELETE /logs wipes stored logs without touching the enabled flag', async () => {
    state.enabled = true;
    state.hasLogs = true;
    state.everEnabled = true;
    state.size = 1234;

    const res = await app.inject({ method: 'DELETE', url: '/api/admin/debug/logs' });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.enabled).toBe(true);
    expect(json.hasLogs).toBe(false);
    expect(json.size).toBe(0);
    // everEnabled must stay true so the download button does not change semantics.
    expect(json.everEnabled).toBe(true);
  });

  it('GET /api/debug/active returns only the enabled boolean (no other settings)', async () => {
    state.enabled = false;
    let res = await app.inject({ method: 'GET', url: '/api/debug/active' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ enabled: false });

    state.enabled = true;
    res = await app.inject({ method: 'GET', url: '/api/debug/active' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ enabled: true });
  });
});

describe('api/routes/debugRouter.js - admin-only enforcement', () => {
  let app;

  beforeEach(async () => {
    const ROOT = path.resolve('.');
    const storagePath = path.join(ROOT, 'lib', 'services', 'debug', 'debugLogStorage.js');
    const bundlePath = path.join(ROOT, 'lib', 'services', 'debug', 'debugBundleService.js');
    const settingsStoragePath = path.join(ROOT, 'lib', 'services', 'storage', 'settingsStorage.js');

    vi.resetModules();
    vi.doMock(storagePath, () => ({
      isEnabled: () => false,
      enableDebugLogging: async () => {},
      disableDebugLogging: async () => {},
      getCurrentSize: async () => 0,
      getMaxSize: () => 5 * 1024 * 1024,
      hasAnyLogs: () => false,
      wasEverEnabled: async () => false,
      clearAllDebugLogs: () => {},
    }));
    vi.doMock(bundlePath, () => ({
      buildDebugBundleFileName: async () => 'x.zip',
      buildDebugBundleZip: async () => Buffer.from(''),
    }));
    vi.doMock(settingsStoragePath, () => ({
      getSettings: async () => ({}),
    }));

    const plugin = (await import(path.join(ROOT, 'lib', 'api', 'routes', 'debugRouter.js'))).default;
    app = Fastify({ logger: false });
    await app.register(
      async (sub) => {
        // Same wiring shape as lib/api/api.js: apply adminHook before the plugin.
        sub.addHook('preHandler', async (request, reply) => {
          reply.code(401).send();
        });
        sub.register(plugin, { prefix: '/api/admin/debug' });
      },
      { prefix: '/' },
    );
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('rejects non-admin callers with 401 on every endpoint', async () => {
    for (const route of [
      ['GET', '/api/admin/debug/status'],
      ['POST', '/api/admin/debug/enable'],
      ['POST', '/api/admin/debug/disable'],
      ['GET', '/api/admin/debug/download'],
      ['DELETE', '/api/admin/debug/logs'],
    ]) {
      const [method, url] = route;
      const res = await app.inject({ method, url, payload: method === 'POST' ? {} : undefined });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });
});
