/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import * as hasher from '../../lib/services/security/hash.js';

const USER = { id: 'user-1', username: 'alice', isAdmin: false };
let passwordHash;

vi.mock('../../lib/services/storage/userStorage.js', () => ({
  getUserWithSecretsByUsername: (name) => (name === USER.username ? { ...USER, password: passwordHash } : null),
  getUser: (id) => (id === USER.id ? USER : null),
  setLastLoginToNow: vi.fn(),
  updatePasswordHash: vi.fn(),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({ getSettings: vi.fn(async () => ({})) }));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackDemoAccessed: vi.fn() }));
vi.mock('../../lib/services/tour/tourService.js', () => ({ cancelTourOnLogout: vi.fn() }));
vi.mock('../../lib/services/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const { createSessionCookieOptions } = await import('../../lib/api/security.js');
const loginPlugin = (await import('../../lib/api/routes/loginRoute.js')).default;

/**
 * The real session plugin in front of the real login route, plus one route that leaves a session
 * behind the way any visit before the login would - or the way an attacker plants one.
 *
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function buildApp() {
  const app = Fastify();
  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: 'a'.repeat(32),
    cookieName: 'fredy-admin-session',
    cookie: createSessionCookieOptions(),
    saveUninitialized: false,
  });
  app.post('/plant', async (request) => {
    request.session.planted = true;
    return {};
  });
  await app.register(loginPlugin, { prefix: '/login' });
  await app.ready();
  return app;
}

/** @returns {string} `name=value` of the session cookie the response set, or '' when none. */
function sessionCookie(res) {
  const header = res.headers['set-cookie'];
  const all = Array.isArray(header) ? header : header == null ? [] : [header];
  return (all.find((entry) => entry.startsWith('fredy-admin-session=')) ?? '').split(';')[0];
}

describe('login session id', () => {
  beforeAll(async () => {
    passwordHash = await hasher.hash('correct horse');
  });

  it('signs in on a new session id and leaves the one from before the login signed out', async () => {
    const app = await buildApp();
    const planted = sessionCookie(await app.inject({ method: 'POST', url: '/plant' }));
    expect(planted).not.toBe('');

    const login = await app.inject({
      method: 'POST',
      url: '/login',
      headers: { cookie: planted },
      payload: { username: 'alice', password: 'correct horse' },
    });
    const issued = sessionCookie(login);

    expect(login.statusCode).toBe(200);
    expect(issued).not.toBe('');
    expect(issued).not.toBe(planted);

    const asPlanter = await app.inject({ method: 'GET', url: '/login/user', headers: { cookie: planted } });
    const asUser = await app.inject({ method: 'GET', url: '/login/user', headers: { cookie: issued } });
    expect(asPlanter.json()).toEqual({});
    expect(asUser.json()).toEqual({ userId: USER.id, username: USER.username, isAdmin: false });

    await app.close();
  });
});
