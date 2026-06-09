/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import Fastify from 'fastify';

describe('api/routes/dashboardRouter.js', () => {
  let app;
  let state;

  async function buildApp() {
    const ROOT = path.resolve('.');
    const jobStoragePath = path.join(ROOT, 'lib', 'services', 'storage', 'jobStorage.js');
    const listingsStoragePath = path.join(ROOT, 'lib', 'services', 'storage', 'listingsStorage.js');
    const settingsStoragePath = path.join(ROOT, 'lib', 'services', 'storage', 'settingsStorage.js');
    const securityPath = path.join(ROOT, 'lib', 'api', 'security.js');

    vi.resetModules();
    vi.doMock(jobStoragePath, () => ({
      getJobs: () => state.jobs.slice(),
    }));
    vi.doMock(listingsStoragePath, () => ({
      getListingsKpisForJobIds: () => ({ numberOfActiveListings: 0, medianPriceOfListings: 0 }),
      getProviderDistributionForJobIds: () => [],
    }));
    vi.doMock(settingsStoragePath, () => ({
      getSettings: async () => ({ interval: 30 }),
    }));
    vi.doMock(securityPath, () => ({
      isAdmin: () => state.admin,
    }));

    const mod = await import(path.join(ROOT, 'lib', 'api', 'routes', 'dashboardRouter.js'));
    const plugin = mod.default;
    const instance = Fastify({ logger: false });
    instance.addHook('onRequest', async (request) => {
      request.session = { currentUser: state.currentUser, createdAt: Date.now() };
    });
    await instance.register(plugin, { prefix: '/api/dashboard' });
    await instance.ready();
    return instance;
  }

  beforeEach(() => {
    state = {
      currentUser: 'u1',
      admin: false,
      jobs: [],
    };
  });

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('derives lastRun from the most recent accessible job for a regular user', async () => {
    state.jobs = [
      { id: 'a', userId: 'u1', shared_with_user: [], lastRunAt: 1000 },
      { id: 'b', userId: 'u1', shared_with_user: [], lastRunAt: 5000 },
      { id: 'c', userId: 'someone-else', shared_with_user: [], lastRunAt: 9999 },
    ];
    app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/dashboard/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.general.lastRun).toBe(5000);
    expect(body.general.nextRun).toBe(5000 + 30 * 60000);
  });

  it('includes shared jobs in the lastRun calculation', async () => {
    state.jobs = [
      { id: 'mine', userId: 'u1', shared_with_user: [], lastRunAt: 1000 },
      { id: 'shared', userId: 'someone-else', shared_with_user: ['u1'], lastRunAt: 4000 },
    ];
    app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/dashboard/' });
    expect(res.json().general.lastRun).toBe(4000);
  });

  it('admins see lastRun across all jobs', async () => {
    state.admin = true;
    state.jobs = [
      { id: 'a', userId: 'someone', shared_with_user: [], lastRunAt: 1000 },
      { id: 'b', userId: 'another', shared_with_user: [], lastRunAt: 7000 },
    ];
    app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/dashboard/' });
    expect(res.json().general.lastRun).toBe(7000);
  });

  it('returns null lastRun and 0 nextRun when no accessible job has ever run', async () => {
    state.jobs = [
      { id: 'a', userId: 'u1', shared_with_user: [], lastRunAt: null },
      { id: 'b', userId: 'someone-else', shared_with_user: [], lastRunAt: 9999 },
    ];
    app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/dashboard/' });
    const body = res.json();
    expect(body.general.lastRun).toBeNull();
    expect(body.general.nextRun).toBe(0);
  });
});
