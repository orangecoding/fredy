/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';

// security.js reads settings for its TTL check; nothing here depends on real settings or a DB.
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({ getSettings: vi.fn(async () => ({})) }));
vi.mock('../../lib/services/storage/userStorage.js', () => ({ getUser: vi.fn() }));

import { createSessionCookieOptions } from '../../lib/api/security.js';

/**
 * Build an app wired exactly like the real server: same cookie options, same trustProxy default,
 * plus one route that writes to the session so a cookie has to be issued.
 *
 * @param {{trustProxy?: boolean}} [opts]
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
async function buildApp({ trustProxy = true } = {}) {
  const app = Fastify({ trustProxy });
  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: 'a'.repeat(32),
    cookieName: 'fredy-admin-session',
    cookie: createSessionCookieOptions(),
    saveUninitialized: false,
  });
  app.post('/login', async (request, reply) => {
    request.session.currentUser = 'user-1';
    request.session.createdAt = Date.now();
    return reply.code(200).send();
  });
  app.get('/probe', async (request) => ({ currentUser: request.session?.currentUser ?? null }));
  await app.ready();
  return app;
}

/**
 * @param {import('light-my-request').Response} res
 * @returns {string} The session cookie's Set-Cookie header, or '' when none was sent.
 */
function sessionCookieHeader(res) {
  const header = res.headers['set-cookie'];
  const all = Array.isArray(header) ? header : header == null ? [] : [header];
  return all.find((entry) => entry.startsWith('fredy-admin-session=')) ?? '';
}

describe('session cookie options', () => {
  it('resolves the secure flag per request instead of pinning it to the configured baseUrl', () => {
    // The regression in #409: `secure` was `baseUrl.startsWith('https://')`, so an admin who
    // entered an https base url flagged the cookie Secure for every request, including the plain
    // http ones. Anything but 'auto' here reintroduces that.
    const options = createSessionCookieOptions();
    expect(options.secure).toBe('auto');
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
  });

  it('hands out a fresh options object each call', () => {
    // The session plugin normalises defaults by writing into the object it is given, so sharing
    // one instance across registrations (or freezing it) breaks startup outright.
    const first = createSessionCookieOptions();
    const second = createSessionCookieOptions();

    expect(first).not.toBe(second);
    expect(() => {
      first.secure = 'auto';
    }).not.toThrow();
  });

  it('issues a usable cookie without Secure when the request arrives over plain http', async () => {
    // Reaching the container directly on the LAN (http://<ip>:9998). With a Secure cookie the
    // plugin sends no Set-Cookie at all, which is what made the login screen reset silently.
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/login' });
    const cookie = sessionCookieHeader(res);

    expect(res.statusCode).toBe(200);
    expect(cookie).not.toBe('');
    expect(cookie).not.toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/HttpOnly/i);

    await app.close();
  });

  it('keeps the session usable across follow-up http requests', async () => {
    // A cookie that is sent but not accepted would look identical at login time and still leave
    // the user logged out, so follow the cookie through a second request.
    const app = await buildApp();

    const login = await app.inject({ method: 'POST', url: '/login' });
    const cookie = sessionCookieHeader(login).split(';')[0];

    const probe = await app.inject({ method: 'GET', url: '/probe', headers: { cookie } });

    expect(probe.json()).toEqual({ currentUser: 'user-1' });

    await app.close();
  });

  it('flags the cookie Secure when the proxy reports an https request', async () => {
    // The https deployment must not lose the flag: fastify derives request.protocol from
    // X-Forwarded-Proto while trustProxy is on, which is the default.
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/login',
      headers: { 'x-forwarded-proto': 'https' },
    });

    expect(sessionCookieHeader(res)).toMatch(/;\s*Secure/i);

    await app.close();
  });

  it('ignores a forwarded protocol claim when trustProxy is off', async () => {
    // With trustProxy disabled the header is attacker-controlled noise, so the flag must follow
    // the actual connection.
    const app = await buildApp({ trustProxy: false });

    const res = await app.inject({
      method: 'POST',
      url: '/login',
      headers: { 'x-forwarded-proto': 'https' },
    });

    expect(sessionCookieHeader(res)).not.toMatch(/;\s*Secure/i);

    await app.close();
  });
});
