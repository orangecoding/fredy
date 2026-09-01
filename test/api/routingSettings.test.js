/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

/**
 * The dials behind travel times and place lookups.
 *
 * Every one of them decides how much traffic Fredy sends at a service run by volunteers, which is
 * the whole reason they are bounded rather than free text. A mistyped ceiling here is not a wrong
 * number on a page, it is the request pattern that gets an instance blocked.
 *
 * The two endpoints are checked separately: they are the escape hatch for an operator who has
 * outgrown the public services, so an empty value has to keep meaning "use the default" rather than
 * being rejected as malformed.
 */
const root = (await import('node:path')).resolve('.');
const settingsStoragePath = root + '/lib/services/storage/settingsStorage.js';

let stored;

async function buildServer() {
  vi.resetModules();
  vi.doMock(settingsStoragePath, () => ({
    getSettings: async () => ({ demoMode: false }),
    getPublicSettings: async () => ({}),
    upsertSettings: (values) => Object.assign(stored, values),
  }));

  const plugin = (await import(root + '/lib/api/routes/generalSettingsRoute.js')).default;
  const app = Fastify();
  app.addHook('preHandler', (request, _reply, done) => {
    request.session = { currentUser: 'admin-1' };
    request.currentUser = { id: 'admin-1', isAdmin: true };
    done();
  });
  await app.register(plugin, { prefix: '/api/admin/generalSettings' });
  return app;
}

const post = (app, payload) => app.inject({ method: 'POST', url: '/api/admin/generalSettings', payload });

beforeEach(() => {
  stored = {};
});

describe('the routing dials', () => {
  it('accepts a value inside its range and stores it as a number', async () => {
    const app = await buildServer();

    const response = await post(app, { travelTimeMaxMinutes: '45' });

    expect(response.statusCode).toBe(200);
    expect(stored.travelTimeMaxMinutes).toBe(45);
  });

  it('refuses a reachability ceiling that would make every sweep enormous', async () => {
    const app = await buildServer();

    const response = await post(app, { travelTimeMaxMinutes: 600 });

    // 90 minutes already answers with about nine megabytes for a big city.
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('travelTimeMaxMinutes');
  });

  it('refuses a cleared box rather than reading it as zero', async () => {
    const app = await buildServer();

    // Number('') is 0, which for a per-run limit silently means "do nothing" and for a ceiling is
    // out of range anyway. Better to tell the operator their value did not arrive.
    expect((await post(app, { travelTimeLimitPerRun: '' })).statusCode).toBe(400);
  });

  it('allows zero where zero is a real choice', async () => {
    const app = await buildServer();

    const response = await post(app, { travelTimeStreetLookupsPerRun: 0, poiLookupsPerRun: 0 });

    // Turning street routing off entirely is legitimate for an operator who wants to be as light as
    // possible on the services Fredy depends on.
    expect(response.statusCode).toBe(200);
    expect(stored.travelTimeStreetLookupsPerRun).toBe(0);
  });

  it('refuses a fractional listing count', async () => {
    const app = await buildServer();

    expect((await post(app, { poiLookupsPerRun: 12.5 })).statusCode).toBe(400);
  });

  it('leaves a dial alone when the request does not mention it', async () => {
    const app = await buildServer();

    await post(app, { travelTimeMaxMinutes: 45 });

    expect(stored).not.toHaveProperty('poiLookupsPerRun');
  });
});

describe('the routing endpoints', () => {
  it('accepts an operator pointing at their own instance', async () => {
    const app = await buildServer();

    const response = await post(app, { overpassBaseUrl: 'https://overpass.example.org/api/interpreter ' });

    expect(response.statusCode).toBe(200);
    // Trimmed, so the client can fall back on emptiness alone.
    expect(stored.overpassBaseUrl).toBe('https://overpass.example.org/api/interpreter');
  });

  it('allows plain http, because a self-hosted instance usually has no certificate', async () => {
    const app = await buildServer();

    expect((await post(app, { motisBaseUrl: 'http://motis.lan:8080/api' })).statusCode).toBe(200);
  });

  it('treats an empty endpoint as "use the built-in default"', async () => {
    const app = await buildServer();

    const response = await post(app, { motisBaseUrl: '' });

    // How an operator undoes a change they regret, so it must not be an error.
    expect(response.statusCode).toBe(200);
    expect(stored.motisBaseUrl).toBe('');
  });

  it('refuses something that is not a URL at all', async () => {
    const app = await buildServer();

    const response = await post(app, { overpassBaseUrl: 'overpass-api.de' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('overpassBaseUrl');
  });

  it('refuses a scheme that is not http', async () => {
    const app = await buildServer();

    expect((await post(app, { motisBaseUrl: 'ftp://example.org/api' })).statusCode).toBe(400);
  });
});

describe('the places switch', () => {
  it('is stored as a boolean whatever the browser sent', async () => {
    const app = await buildServer();

    await post(app, { poiEnabled: 'true' });

    // A string 'false' is truthy, which is exactly the bug the strict comparison exists to avoid.
    expect(stored.poiEnabled).toBe(false);
  });

  it('stores a real true', async () => {
    const app = await buildServer();

    await post(app, { poiEnabled: true });

    expect(stored.poiEnabled).toBe(true);
  });
});
