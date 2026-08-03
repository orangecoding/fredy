/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const root = (await import('node:path')).resolve('.');
const settingsStoragePath = root + '/lib/services/storage/settingsStorage.js';

let globalSettings;
let stored;

/**
 * A server with the user settings routes mounted over an in-memory settings store.
 *
 * @param {{isAdmin?: boolean}} [session]
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function buildServer({ isAdmin = false } = {}) {
  vi.resetModules();
  vi.doMock(settingsStoragePath, () => ({
    getSettings: async () => globalSettings,
    getUserSettings: () => stored,
    upsertSettings: (values) => Object.assign(stored, values),
  }));

  const plugin = (await import(root + '/lib/api/routes/userSettingsRoute.js')).default;
  const app = Fastify();
  app.addHook('preHandler', (request, _reply, done) => {
    request.session = { currentUser: 'user-1' };
    request.currentUser = { id: 'user-1', isAdmin };
    done();
  });
  await app.register(plugin, { prefix: '/api/user/settings' });
  return app;
}

const post = (app, body) =>
  app.inject({ method: 'POST', url: '/api/user/settings/transit-hover-popups', payload: body });

beforeEach(() => {
  globalSettings = { demoMode: false };
  stored = {};
});

describe('POST /api/user/settings/transit-hover-popups', () => {
  it('stores the preference', async () => {
    const app = await buildServer();
    const response = await post(app, { transit_hover_popups: true });

    expect(response.statusCode).toBe(200);
    expect(stored.transit_hover_popups).toBe(true);
    await app.close();
  });

  it('stores it being switched off again', async () => {
    stored = { transit_hover_popups: true };
    const app = await buildServer();
    await post(app, { transit_hover_popups: false });

    expect(stored.transit_hover_popups).toBe(false);
    await app.close();
  });

  it.each([
    ['a string', { transit_hover_popups: 'true' }],
    ['a number', { transit_hover_popups: 1 }],
    ['null', { transit_hover_popups: null }],
    ['nothing at all', {}],
  ])('rejects %s rather than coercing it', async (_label, body) => {
    const app = await buildServer();
    const response = await post(app, body);

    expect(response.statusCode).toBe(400);
    expect(stored.transit_hover_popups).toBeUndefined();
    await app.close();
  });

  it('refuses a non-admin on a demo instance', async () => {
    globalSettings = { demoMode: true };
    const app = await buildServer({ isAdmin: false });
    const response = await post(app, { transit_hover_popups: true });

    expect(response.statusCode).toBe(403);
    expect(stored.transit_hover_popups).toBeUndefined();
    await app.close();
  });

  it('still lets an admin change it on a demo instance', async () => {
    globalSettings = { demoMode: true };
    const app = await buildServer({ isAdmin: true });
    const response = await post(app, { transit_hover_popups: true });

    expect(response.statusCode).toBe(200);
    expect(stored.transit_hover_popups).toBe(true);
    await app.close();
  });
});
