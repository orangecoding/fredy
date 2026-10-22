/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';

vi.mock('../../lib/services/storage/settingsStorage.js', () => ({ getSettings: vi.fn(async () => ({})) }));
vi.mock('../../lib/services/storage/userStorage.js', () => ({
  getUser: vi.fn((id) => (id === 'user-1' ? { id: 'user-1', isAdmin: false } : null)),
}));

const { authHook, createSessionOptions, startSession, SESSION_COOKIE_MAX_AGE, SESSION_TOUCH_INTERVAL_MS } =
  await import('../../lib/api/security.js');

/**
 * The session plugin's default saved every session on every response, static files and the debug
 * poll included, and `touchSession` changed the session on every authenticated request besides. On
 * an SD card that was thousands of database writes a day per open tab. What is counted here is
 * what reaches the store, through the plugin options the server registers.
 */
describe('session writes', () => {
  let app;
  let writes;
  const NOW = new Date('2026-10-21T10:00:00Z').getTime();

  /** A store that keeps sessions in a map and counts every write. */
  const countingStore = () => {
    const sessions = new Map();
    return {
      set(sid, session, callback) {
        writes++;
        sessions.set(sid, JSON.parse(JSON.stringify(session)));
        callback();
      },
      get(sid, callback) {
        callback(null, sessions.get(sid) ?? null);
      },
      destroy(sid, callback) {
        sessions.delete(sid);
        callback();
      },
    };
  };

  /** @returns {string} The session cookie's Set-Cookie header, or '' when none was sent. */
  const sessionCookieHeader = (res) => {
    const header = res.headers['set-cookie'];
    const all = Array.isArray(header) ? header : header == null ? [] : [header];
    return all.find((entry) => entry.startsWith('fredy-admin-session=')) ?? '';
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    writes = 0;
    app = Fastify();
    await app.register(fastifyCookie);
    await app.register(fastifySession, createSessionOptions({ secret: 'a'.repeat(32), store: countingStore() }));
    app.post('/login', async (request) => {
      await startSession(request, 'user-1');
      return {};
    });
    app.get('/api/jobs', { preHandler: authHook }, async () => ({}));
    app.get('/asset.js', async () => 'console.log(1)');
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.useRealTimers();
  });

  const signIn = async () => sessionCookieHeader(await app.inject({ method: 'POST', url: '/login' })).split(';')[0];

  it('writes nothing for requests inside the same minute', async () => {
    const cookie = await signIn();
    const afterLogin = writes;

    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(NOW + i * 10_000);
      const res = await app.inject({ method: 'GET', url: '/api/jobs', headers: { cookie } });
      expect(res.statusCode).toBe(200);
      expect(sessionCookieHeader(res)).toBe('');
    }
    await app.inject({ method: 'GET', url: '/asset.js', headers: { cookie } });

    expect(writes).toBe(afterLogin);
  });

  it('writes once a minute of use, and sends the cookie with a fresh expiry when it does', async () => {
    const cookie = await signIn();
    const afterLogin = writes;
    const later = NOW + SESSION_TOUCH_INTERVAL_MS;
    vi.setSystemTime(later);

    const res = await app.inject({ method: 'GET', url: '/api/jobs', headers: { cookie } });

    expect(writes).toBe(afterLogin + 1);
    const expires = /Expires=([^;]+)/.exec(sessionCookieHeader(res))?.[1];
    // An active user's cookie keeps following them rather than running out 30 days after login.
    expect(new Date(expires).getTime()).toBe(new Date(later + SESSION_COOKIE_MAX_AGE).setMilliseconds(0));
  });
});
