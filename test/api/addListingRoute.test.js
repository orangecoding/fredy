/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';

/**
 * `POST /api/listings`, adding one listing by URL. The service decides; the route only refuses what
 * should never have been sent and keeps a shared demo from reaching out to portals.
 */
const root = (await import('node:path')).resolve('.');

let serviceCalls;
let tracked;

/**
 * @param {{demoMode?: boolean, isAdmin?: boolean, result?: Object}} [options]
 */
async function buildServer({
  demoMode = false,
  isAdmin = false,
  result = { status: 'created', listingId: 'row-1' },
} = {}) {
  vi.resetModules();
  serviceCalls = [];
  tracked = [];

  vi.doMock(root + '/lib/services/listings/manualListingService.js', () => ({
    addListingByUrl: async (params) => {
      serviceCalls.push(params);
      return result;
    },
  }));
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => ({ demoMode }),
    getUserSettings: () => ({}),
  }));
  vi.doMock(root + '/lib/services/tracking/Tracker.js', () => ({ trackPoi: async (poi) => tracked.push(poi) }));

  const plugin = (await import(root + '/lib/api/routes/listingsRouter.js')).default;
  const app = Fastify();
  app.addHook('preHandler', (request, _reply, done) => {
    request.session = { currentUser: 'user-1' };
    request.currentUser = { id: 'user-1', isAdmin };
    done();
  });
  await app.register(plugin, { prefix: '/api/listings' });
  return app;
}

const add = (app, payload) => app.inject({ method: 'POST', url: '/api/listings', payload });

describe('POST /api/listings', () => {
  it('hands the request to the service and answers with its result', async () => {
    const app = await buildServer();
    const response = await add(app, { url: 'https://www.immobilienscout24.de/expose/1', jobId: 'job-1', watch: true });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'created', listingId: 'row-1' });
    expect(serviceCalls).toEqual([
      {
        user: { id: 'user-1', isAdmin: false },
        url: 'https://www.immobilienscout24.de/expose/1',
        jobId: 'job-1',
        watch: true,
      },
    ]);
    expect(tracked).toEqual(['LISTING_ADDED_BY_URL']);
    await app.close();
  });

  it('counts only what was actually stored', async () => {
    const app = await buildServer({ result: { status: 'duplicate', listingId: 'row-9' } });
    const response = await add(app, { url: 'https://www.immobilienscout24.de/expose/1', jobId: 'job-1' });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('duplicate');
    expect(tracked).toEqual([]);
    await app.close();
  });

  it('only watches on an explicit true', async () => {
    const app = await buildServer();
    await add(app, { url: 'https://www.immobilienscout24.de/expose/1', jobId: 'job-1', watch: 'yes' });

    expect(serviceCalls[0].watch).toBe(false);
    await app.close();
  });

  it('refuses a body without a url or a job', async () => {
    const app = await buildServer();
    for (const payload of [{}, { url: 'https://x.de/1' }, { jobId: 'job-1' }, { url: 1, jobId: 'job-1' }]) {
      expect((await add(app, payload)).statusCode).toBe(400);
    }
    expect(serviceCalls).toEqual([]);
    await app.close();
  });

  it('maps a URL Fredy may not open to 400 and a job the user may not add to to 403', async () => {
    let app = await buildServer({ result: { status: 'invalidUrl' } });
    expect((await add(app, { url: 'http://127.0.0.1/', jobId: 'job-1' })).statusCode).toBe(400);
    await app.close();

    app = await buildServer({ result: { status: 'forbidden' } });
    expect((await add(app, { url: 'https://www.immobilienscout24.de/expose/1', jobId: 'job-2' })).statusCode).toBe(403);
    await app.close();
  });

  it('keeps a shared demo from reaching out to portals, except for an admin', async () => {
    let app = await buildServer({ demoMode: true });
    expect((await add(app, { url: 'https://www.immobilienscout24.de/expose/1', jobId: 'job-1' })).statusCode).toBe(403);
    expect(serviceCalls).toEqual([]);
    await app.close();

    app = await buildServer({ demoMode: true, isAdmin: true });
    expect((await add(app, { url: 'https://www.immobilienscout24.de/expose/1', jobId: 'job-1' })).statusCode).toBe(200);
    await app.close();
  });
});
