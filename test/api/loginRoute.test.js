/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Mock everything the login route pulls in so the suite has no DB / analytics / config side effects.
vi.mock('../../lib/services/storage/userStorage.js', () => ({
  getUser: vi.fn(),
  getUsers: vi.fn(() => []),
  setLastLoginToNow: vi.fn(),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackDemoAccessed: vi.fn() }));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({ getSettings: vi.fn(async () => ({})) }));
vi.mock('../../lib/services/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn() } }));

import { getUser } from '../../lib/services/storage/userStorage.js';
import loginPlugin from '../../lib/api/routes/loginRoute.js';

const SESSION_MAX_AGE = 2 * 60 * 60 * 1000;
const freshSession = () => ({ currentUser: 'user-1', createdAt: Date.now() });
const expiredSession = () => ({ currentUser: 'user-1', createdAt: Date.now() - (SESSION_MAX_AGE + 1000) });

let testSession;

/**
 * Build a Fastify instance with the login plugin and a hook that injects a per-test session.
 */
async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.session = testSession;
  });
  await app.register(loginPlugin);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  testSession = undefined;
  getUser.mockReturnValue({ id: 'user-1', isAdmin: true });
});

describe('GET /user', () => {
  it('returns the current user for a fresh, authorized session', async () => {
    testSession = freshSession();
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/user' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'user-1', isAdmin: true });

    await app.close();
  });

  it('returns an empty object when the session has hard-expired', async () => {
    // The bug: a session that is past SESSION_MAX_AGE must NOT report the user as logged in,
    // otherwise the client never redirects to login and every write keeps 401ing.
    testSession = expiredSession();
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/user' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({});

    await app.close();
  });

  it('returns an empty object when there is no session at all', async () => {
    testSession = undefined;
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/user' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({});

    await app.close();
  });
});
