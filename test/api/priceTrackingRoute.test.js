/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const root = (await import('node:path')).resolve('.');
const settingsPath = root + '/lib/services/storage/settingsStorage.js';
const cronPath = root + '/lib/services/crons/price-tracking-cron.js';

let settings;
let running;
let started;

/**
 * A server with just this route mounted, over stubbed settings and a stubbed sweep.
 *
 * The sweep itself renders one browser page per tracked listing, so nothing here may reach the
 * real one - the point of these cases is which requests are allowed to set it off at all.
 *
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function buildServer() {
  vi.resetModules();
  vi.doMock(settingsPath, () => ({ getSettings: async () => settings }));
  vi.doMock(cronPath, () => ({
    isPriceTrackingRunning: () => running,
    runPriceTracking: async () => {
      started += 1;
      return true;
    },
  }));

  const plugin = (await import(root + '/lib/api/routes/priceTrackingRouter.js')).default;
  const app = Fastify();
  await app.register(plugin, { prefix: '/api/admin/price-tracking' });
  return app;
}

beforeEach(() => {
  settings = { priceTrackingEnabled: true };
  running = false;
  started = 0;
});

describe('POST /api/admin/price-tracking/run', () => {
  it('accepts the run and does not wait for it to finish', async () => {
    const app = await buildServer();
    const response = await app.inject({ method: 'POST', url: '/api/admin/price-tracking/run' });

    // 202, not 200: a sweep takes minutes, and the caller wants to know it was accepted rather
    // than to hold a connection open until the last listing has been re-priced.
    expect(response.statusCode).toBe(202);
    expect(started).toBe(1);
    await app.close();
  });

  it('refuses when the feature is switched off, and says so', async () => {
    settings = { priceTrackingEnabled: false };
    const app = await buildServer();
    const response = await app.inject({ method: 'POST', url: '/api/admin/price-tracking/run' });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/switched off/i);
    expect(started).toBe(0);
    await app.close();
  });

  it('treats a missing flag as off rather than as permission', async () => {
    settings = {};
    const app = await buildServer();
    expect((await app.inject({ method: 'POST', url: '/api/admin/price-tracking/run' })).statusCode).toBe(409);
    expect(started).toBe(0);
    await app.close();
  });

  it('refuses a second run while one is already going', async () => {
    running = true;
    const app = await buildServer();
    const response = await app.inject({ method: 'POST', url: '/api/admin/price-tracking/run' });

    // The cron drops an overlapping slot silently, which is right for a schedule and wrong for a
    // button: the operator would be told it started when it did not.
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/already in progress/i);
    expect(started).toBe(0);
    await app.close();
  });
});
