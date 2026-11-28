/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { up as createPushTable } from '../../lib/services/storage/migrations/sql/62.push-subscriptions.js';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params = {}) => db.prepare(sql).all(params),
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    withTransaction: (cb) => db.transaction(() => cb(db))(),
  },
}));
vi.mock('../../lib/services/push/webPushService.js', () => ({
  getOrCreateVapidKeys: vi.fn(async () => ({ publicKey: 'public-key', privateKey: 'private-key' })),
  sendPushToUser: vi.fn(async () => ({ sent: 1, failed: 0, removed: 0 })),
}));
let demoMode = false;
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ demoMode })),
}));

const pushPlugin = (await import('../../lib/api/routes/pushRouter.js')).default;
const { sendPushToUser } = await import('../../lib/services/push/webPushService.js');

/** Registers the plugin the way api.js does, with the session already resolved to a user. */
async function buildApp(userId, { admin = false } = {}) {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    request.session = { currentUser: userId };
    request.currentUser = { id: userId, isAdmin: admin };
  });
  await app.register(pushPlugin, { prefix: '/api/user/push' });
  await app.ready();
  return app;
}

const subscriptionBody = (n, endpoint = `https://push.example/${n}`) => ({
  subscription: { endpoint, keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` } },
});

let alice;
let bob;

beforeEach(async () => {
  demoMode = false;
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users (id) VALUES ('alice'), ('bob');`);
  createPushTable(db);
  alice = await buildApp('alice');
  bob = await buildApp('bob');
});

afterEach(async () => {
  await alice.close();
  await bob.close();
  db.close();
});

const subscribe = (app, n, headers = {}) =>
  app.inject({ method: 'POST', url: '/api/user/push/subscriptions', payload: subscriptionBody(n), headers });
const devicesOf = async (app) => (await app.inject({ method: 'GET', url: '/api/user/push/subscriptions' })).json();

describe('push routes', () => {
  it('hands out the public key only', async () => {
    const response = await alice.inject({ method: 'GET', url: '/api/user/push/public-key' });
    expect(response.json()).toEqual({ publicKey: 'public-key' });
  });

  it('stores a device for the signed-in user, with the origin it subscribed from', async () => {
    const response = await subscribe(alice, 1, { origin: 'https://fredy.example', 'user-agent': 'Firefox' });

    expect(response.statusCode).toBe(200);
    expect(await devicesOf(alice)).toEqual([
      expect.objectContaining({ endpoint: 'https://push.example/1', userAgent: 'Firefox', lastSuccessAt: null }),
    ]);
    expect(await devicesOf(bob)).toEqual([]);
    expect(db.prepare(`SELECT origin FROM push_subscription`).get().origin).toBe('https://fredy.example');
  });

  it('refuses anything that is not an https push subscription', async () => {
    for (const payload of [
      {},
      { subscription: { endpoint: 'https://push.example/1', keys: {} } },
      subscriptionBody(1, 'http://169.254.169.254/latest'),
      subscriptionBody(1, 'not a url'),
    ]) {
      const response = await alice.inject({ method: 'POST', url: '/api/user/push/subscriptions', payload });
      expect(response.statusCode).toBe(400);
    }
    expect(await devicesOf(alice)).toEqual([]);
  });

  it('refuses endpoints inside the network, which the test push would otherwise reach', async () => {
    for (const endpoint of [
      'https://192.168.1.10:8443/anything',
      'https://10.0.0.1/',
      'https://127.0.0.1/',
      'https://localhost/',
      'https://[::1]/',
      'https://user:pass@push.example/1',
    ]) {
      const response = await alice.inject({
        method: 'POST',
        url: '/api/user/push/subscriptions',
        payload: subscriptionBody(1, endpoint),
      });
      expect(response.statusCode, endpoint).toBe(400);
    }
    expect(await devicesOf(alice)).toEqual([]);
  });

  it('is closed to everyone but an admin in demo mode, where all visitors share one account', async () => {
    await subscribe(alice, 1);
    sendPushToUser.mockClear();
    demoMode = true;

    for (const [method, url] of [
      ['GET', '/api/user/push/public-key'],
      ['GET', '/api/user/push/subscriptions'],
      ['POST', '/api/user/push/test'],
    ]) {
      const response = await alice.inject({ method, url });
      expect(response.statusCode, `${method} ${url}`).toBe(403);
    }
    expect((await subscribe(alice, 2)).statusCode).toBe(403);
    expect(sendPushToUser).not.toHaveBeenCalled();

    const admin = await buildApp('alice', { admin: true });
    expect((await admin.inject({ method: 'GET', url: '/api/user/push/subscriptions' })).json()).toHaveLength(1);
    await admin.close();
  });

  it('only removes the caller’s own devices', async () => {
    await subscribe(alice, 1);
    await subscribe(bob, 2);
    const [bobsDevice] = await devicesOf(bob);

    const byEndpoint = await alice.inject({
      method: 'DELETE',
      url: '/api/user/push/subscriptions',
      payload: { endpoint: 'https://push.example/2' },
    });
    const byId = await alice.inject({
      method: 'DELETE',
      url: '/api/user/push/subscriptions',
      payload: { id: bobsDevice.id },
    });

    expect(byEndpoint.json()).toEqual({ removed: false });
    expect(byId.json()).toEqual({ removed: false });
    expect(await devicesOf(bob)).toHaveLength(1);

    const own = await alice.inject({
      method: 'DELETE',
      url: '/api/user/push/subscriptions',
      payload: { endpoint: 'https://push.example/1' },
    });
    expect(own.json()).toEqual({ removed: true });
    expect(await devicesOf(alice)).toEqual([]);
  });

  it('sends the test push to the caller’s devices', async () => {
    const response = await alice.inject({ method: 'POST', url: '/api/user/push/test' });

    expect(response.json()).toEqual({ sent: 1, failed: 0, removed: 0 });
    expect(sendPushToUser).toHaveBeenCalledWith('alice', expect.objectContaining({ tag: 'fredy-test' }), {
      urgency: 'high',
    });
  });
});
