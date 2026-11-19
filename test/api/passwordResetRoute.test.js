/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

/**
 * "Forgot password?" on the login screen. A code written to the console is the only proof of the
 * right to reset, so these tests are mostly about what the code must not let through: a reset
 * without it, a second reset with the same one, guessing it, and the code itself leaking into the
 * logger lines that feed the debug bundle.
 */

let state;
let consoleWarn;

/**
 * Fresh modules per test: the rate limiter and the code live at module scope.
 *
 * @param {import('fastify').FastifyServerOptions} [fastifyOptions]
 * @returns {Promise<{ app: import('fastify').FastifyInstance, logger: { error: Function, info: Function, warn: Function } }>}
 */
async function buildApp(fastifyOptions = {}) {
  vi.resetModules();
  // warnConsoleOnly still writes to the console here, so `consoleWarn` sees every printed code.
  // That it stays out of the debug log sink is the logger's own test.
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), warnConsoleOnly: vi.fn((...a) => console.warn(...a)) };
  vi.doMock('../../lib/services/storage/userStorage.js', () => ({
    getUserByUsername: (username) => state.users.find((u) => u.username === username) ?? null,
    upsertUser: vi.fn(async (args) => state.upserts.push(args)),
    getUser: vi.fn(),
    setLastLoginToNow: vi.fn(),
  }));
  vi.doMock('../../lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => ({ demoMode: state.demoMode }),
  }));
  vi.doMock('../../lib/services/tracking/Tracker.js', () => ({ trackDemoAccessed: vi.fn(), trackPoi: state.trackPoi }));
  vi.doMock('../../lib/services/tour/tourService.js', () => ({ cancelTourOnLogout: vi.fn() }));
  vi.doMock('../../lib/services/logger.js', () => ({ default: logger }));
  vi.doMock('../../lib/utils/detectBaseUrl.js', () => ({ isRunningInDocker: () => state.docker }));

  const loginPlugin = (await import('../../lib/api/routes/loginRoute.js')).default;
  const app = Fastify(fastifyOptions);
  await app.register(loginPlugin);
  await app.ready();
  return { app, logger };
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {string} [ip]
 * @returns {Promise<import('light-my-request').Response>}
 */
const requestCode = (app, ip = '10.0.0.1') =>
  app.inject({ method: 'POST', url: '/reset-code', payload: {}, remoteAddress: ip });

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {Record<string, unknown>} body
 * @param {string} [ip]
 * @returns {Promise<import('light-my-request').Response>}
 */
const resetPassword = (app, body, ip = '10.0.0.1') =>
  app.inject({ method: 'POST', url: '/reset-password', payload: body, remoteAddress: ip });

/** @returns {string|null} The last code printed to the console. */
function printedCode() {
  const lines = consoleWarn.mock.calls.map((args) => args.join(' '));
  const match = lines
    .map((line) => line.match(/code: ([A-Z0-9]{4}-[A-Z0-9]{4})/))
    .filter(Boolean)
    .pop();
  return match ? match[1] : null;
}

beforeEach(() => {
  state = {
    demoMode: false,
    docker: false,
    trackPoi: vi.fn(async () => {}),
    users: [{ id: 'u-1', username: 'admin', isAdmin: true }],
    upserts: [],
  };
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  consoleWarn.mockRestore();
  vi.useRealTimers();
});

describe('POST /reset-code', () => {
  it('prints the code with the requesting address on one console-only line', async () => {
    const { app, logger } = await buildApp();

    const res = await requestCode(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().expiresAt).toBeGreaterThan(Date.now());
    const code = printedCode();
    expect(code).not.toBeNull();
    expect(logger.warnConsoleOnly).toHaveBeenCalledTimes(1);
    expect(logger.warnConsoleOnly.mock.calls[0].join(' ')).toContain('10.0.0.1');
    const recorded = [...logger.warn.mock.calls, ...logger.info.mock.calls, ...logger.error.mock.calls]
      .flat()
      .join(' ');
    expect(recorded).not.toContain(code);
    await app.close();
  });

  // The form names `docker logs` only where that is where the logs are.
  it.each([true, false])('says whether Fredy runs in Docker (%s)', async (docker) => {
    state.docker = docker;
    const { app } = await buildApp();

    const res = await requestCode(app);

    expect(res.json().docker).toBe(docker);
    await app.close();
  });

  it('prints nothing new while a code is live', async () => {
    const { app } = await buildApp();
    const first = await requestCode(app);

    const second = await requestCode(app, '10.0.0.2');

    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(second.json().expiresAt).toBe(first.json().expiresAt);
    await app.close();
  });

  // Once per written code, so anyone hammering the open endpoint cannot inflate the counter.
  it('tracks the feature once per code written, not per click', async () => {
    const { app } = await buildApp();

    await requestCode(app);
    await requestCode(app);

    expect(state.trackPoi).toHaveBeenCalledTimes(1);
    expect(state.trackPoi).toHaveBeenCalledWith('PASSWORD_RESET_REQUESTED');
    await app.close();
  });

  it('is not available in demo mode', async () => {
    state.demoMode = true;
    const { app } = await buildApp();

    const res = await requestCode(app);

    expect(res.statusCode).toBe(403);
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(state.trackPoi).not.toHaveBeenCalled();
    await app.close();
  });

  // Behind a proxy that sends no X-Forwarded-For everybody has the proxy's address. A limit per
  // address let ten clicks by a stranger lock the admin out of the reset for a quarter of an hour.
  it('does not lock an address out for asking often', async () => {
    const { app } = await buildApp();
    for (let i = 0; i < 30; i++) {
      expect((await requestCode(app)).statusCode).toBe(200);
    }

    expect(consoleWarn).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('writes no new code while the one that was guessed to death has not run out', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { app } = await buildApp();
    await requestCode(app);
    for (let i = 0; i < 5; i++) {
      await resetPassword(app, { username: 'admin', password: 'a', password2: 'a', code: 'AAAA-AAAA' });
    }

    expect((await requestCode(app)).statusCode).toBe(429);
    expect(consoleWarn).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 3 * 60 * 1000);
    expect((await requestCode(app)).statusCode).toBe(200);
    expect(consoleWarn).toHaveBeenCalledTimes(2);
    await app.close();
  });

  // With trustProxy on, which is Fredy's default, the address is the first entry of
  // X-Forwarded-For, and that one the client writes itself.
  it('gives a client that makes up its address neither more codes nor more guesses', async () => {
    const { app } = await buildApp({ trustProxy: true });
    let made = 0;
    const post = (url, payload) =>
      app.inject({
        method: 'POST',
        url,
        payload,
        remoteAddress: '172.18.0.1',
        headers: { 'x-forwarded-for': `198.51.100.${made++ % 250}, 203.0.113.9` },
      });
    await post('/reset-code', {});
    const code = printedCode();

    for (let i = 0; i < 20; i++) {
      await post('/reset-code', {});
      await post('/reset-password', { username: 'admin', password: 'a', password2: 'a', code: 'AAAA-AAAA' });
    }
    const late = await post('/reset-password', { username: 'admin', password: 'a', password2: 'a', code });

    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(late.statusCode).toBe(403);
    expect(state.upserts).toHaveLength(0);
    await app.close();
  });
});

describe('POST /reset-password', () => {
  it('sets the new password with the right code, through upsertUser so the sessions end', async () => {
    const { app } = await buildApp();
    await requestCode(app);

    const res = await resetPassword(app, {
      username: ' admin ',
      password: 'n3w-secret',
      password2: 'n3w-secret',
      code: printedCode().toLowerCase(),
    });

    expect(res.statusCode).toBe(200);
    expect(state.upserts).toEqual([{ userId: 'u-1', username: 'admin', password: 'n3w-secret', isAdmin: true }]);
    await app.close();
  });

  it('works once', async () => {
    const { app } = await buildApp();
    await requestCode(app);
    const body = { username: 'admin', password: 'a', password2: 'a', code: printedCode() };
    await resetPassword(app, body);

    const again = await resetPassword(app, body);

    expect(again.statusCode).toBe(403);
    expect(state.upserts).toHaveLength(1);
    await app.close();
  });

  it('refuses a wrong code, and the same answer for a user that does not exist', async () => {
    const { app } = await buildApp();
    await requestCode(app);

    const known = await resetPassword(app, { username: 'admin', password: 'a', password2: 'a', code: 'AAAA-AAAA' });
    const unknown = await resetPassword(app, { username: 'nobody', password: 'a', password2: 'a', code: 'AAAA-AAAA' });

    expect(known.statusCode).toBe(403);
    expect(unknown.statusCode).toBe(403);
    expect(unknown.json()).toEqual(known.json());
    expect(state.upserts).toHaveLength(0);
    await app.close();
  });

  it('refuses the right code once it ran out', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { app } = await buildApp();
    await requestCode(app);
    vi.setSystemTime(Date.now() + 3 * 60 * 1000);

    const res = await resetPassword(app, { username: 'admin', password: 'a', password2: 'a', code: printedCode() });

    expect(res.statusCode).toBe(403);
    expect(state.upserts).toHaveLength(0);
    await app.close();
  });

  it('kills the code after five wrong guesses, from any address', async () => {
    const { app } = await buildApp();
    await requestCode(app);
    for (let i = 0; i < 5; i++) {
      await resetPassword(app, { username: 'admin', password: 'a', password2: 'a', code: 'AAAA-AAAA' }, `10.0.1.${i}`);
    }

    const res = await resetPassword(app, { username: 'admin', password: 'a', password2: 'a', code: printedCode() });

    expect(res.statusCode).toBe(403);
    expect(state.upserts).toHaveLength(0);
    await app.close();
  });

  it('lets only one of two requests arriving together with the right code through', async () => {
    const { app } = await buildApp();
    await requestCode(app);
    const body = { username: 'admin', password: 'a', password2: 'a', code: printedCode() };

    const answers = await Promise.all([resetPassword(app, body), resetPassword(app, body, '10.0.0.2')]);

    expect(answers.map((res) => res.statusCode).sort()).toEqual([200, 403]);
    expect(state.upserts).toHaveLength(1);
    await app.close();
  });

  it('keeps the code when the code was right but the user name was not', async () => {
    const { app } = await buildApp();
    await requestCode(app);
    const code = printedCode();

    const typo = await resetPassword(app, { username: 'Admin', password: 'a', password2: 'a', code });
    const fixed = await resetPassword(app, { username: 'admin', password: 'a', password2: 'a', code });

    expect(typo.statusCode).toBe(404);
    expect(fixed.statusCode).toBe(200);
    await app.close();
  });

  it('checks the input before the code, so a typo in the passwords costs no guess', async () => {
    const { app } = await buildApp();
    await requestCode(app);
    for (let i = 0; i < 5; i++) {
      const res = await resetPassword(
        app,
        { username: 'admin', password: 'a', password2: 'b', code: 'AAAA-AAAA' },
        `10.0.2.${i}`,
      );
      expect(res.statusCode).toBe(400);
    }

    const res = await resetPassword(app, { username: 'admin', password: 'a', password2: 'a', code: printedCode() });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('refuses a request without user name, password or code', async () => {
    const { app } = await buildApp();
    await requestCode(app);
    const code = printedCode();

    for (const body of [
      { password: 'a', password2: 'a', code },
      { username: 'admin', password: '', password2: '', code },
      { username: 'admin', password: 'a', password2: 'a' },
    ]) {
      expect((await resetPassword(app, body)).statusCode).toBe(400);
    }
    expect(state.upserts).toHaveLength(0);
    await app.close();
  });

  it('refuses a body that is not the expected JSON, at no cost to the code', async () => {
    const { app } = await buildApp();
    await requestCode(app);
    const code = printedCode();
    const bodies = [
      { username: 'admin', password: 'a', password2: 'a', code: 12345678 },
      { username: 'admin', password: 'a', password2: 'a', code: ['AAAA-AAAA'] },
      { username: { $ne: null }, password: 'a', password2: 'a', code: 'AAAA-AAAA' },
      { username: 'admin', password: ['a'], password2: ['a'], code: 'AAAA-AAAA' },
    ];

    for (const body of bodies) {
      expect((await resetPassword(app, body)).statusCode).toBe(400);
    }
    // What a form on another site can send without a preflight.
    const crossSite = await app.inject({
      method: 'POST',
      url: '/reset-password',
      headers: { 'content-type': 'text/plain' },
      payload: JSON.stringify({ username: 'admin', password: 'a', password2: 'a', code }),
    });
    expect(crossSite.statusCode).toBe(400);

    const res = await resetPassword(app, { username: 'admin', password: 'a', password2: 'a', code });
    expect(res.statusCode).toBe(200);
    expect(state.upserts).toHaveLength(1);
    await app.close();
  });

  it('is not available in demo mode', async () => {
    state.demoMode = true;
    const { app } = await buildApp();

    const res = await resetPassword(app, { username: 'admin', password: 'a', password2: 'a', code: 'AAAA-AAAA' });

    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
