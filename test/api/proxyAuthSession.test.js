/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const ADMIN = { id: 'user-1', username: 'admin', isAdmin: true };
let settings = {};

vi.mock('../../lib/services/storage/userStorage.js', () => ({
  getUser: vi.fn((id) => (id === ADMIN.id ? ADMIN : null)),
  getUserByUsername: vi.fn((name) => (name === ADMIN.username ? ADMIN : null)),
  setLastLoginToNow: vi.fn(),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({ getSettings: vi.fn(async () => settings) }));

import { setLastLoginToNow } from '../../lib/services/storage/userStorage.js';
import { isUnauthorized, authHook } from '../../lib/api/security.js';
import { proxyAuthHook } from '../../lib/api/proxyAuth.js';

const PROXY_ON = { proxyAuthEnabled: true, proxyAuthTrustedProxies: '172.16.0.0/12' };

const fromProxy = (headers = { 'remote-user': 'admin' }, session = {}) => ({
  socket: { remoteAddress: '172.16.51.1' },
  headers,
  session,
});

function makeReply() {
  return {
    statusCode: null,
    code(c) {
      this.statusCode = c;
      return this;
    },
    send() {
      return this;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  settings = {};
});

describe('proxyAuthHook', () => {
  it('signs the request in when the proxy vouches for a known user', async () => {
    settings = PROXY_ON;
    const request = fromProxy();

    await proxyAuthHook(request);

    expect(await isUnauthorized(request)).toBe(false);
    expect(request.session.currentUser).toBe(ADMIN.id);
    expect(Date.now() - request.session.createdAt).toBeLessThan(1000);
    expect(setLastLoginToNow).toHaveBeenCalledWith({ userId: ADMIN.id });
  });

  it('lets authHook resolve the user on the very first request, no login round-trip', async () => {
    settings = PROXY_ON;
    const request = fromProxy();
    const reply = makeReply();

    await proxyAuthHook(request);
    await authHook(request, reply);

    expect(reply.statusCode).toBeNull();
    expect(request.currentUser).toEqual(ADMIN);
  });

  it('is a no-op on requests without a session object', async () => {
    settings = PROXY_ON;
    await expect(proxyAuthHook({ socket: { remoteAddress: '172.16.51.1' }, headers: {} })).resolves.toBeUndefined();
    expect(setLastLoginToNow).not.toHaveBeenCalled();
  });

  it('does nothing when the feature is off', async () => {
    const request = fromProxy();

    await proxyAuthHook(request);

    expect(await isUnauthorized(request)).toBe(true);
    expect(request.session.currentUser).toBeUndefined();
    expect(setLastLoginToNow).not.toHaveBeenCalled();
  });

  it('leaves a valid existing session alone even if the proxy names someone else', async () => {
    settings = PROXY_ON;
    const request = fromProxy({ 'remote-user': 'admin' }, { currentUser: 'user-2', createdAt: Date.now() });

    await proxyAuthHook(request);

    expect(await isUnauthorized(request)).toBe(false);
    expect(request.session.currentUser).toBe('user-2');
    expect(setLastLoginToNow).not.toHaveBeenCalled();
  });

  it('re-establishes an expired session from the proxy instead of bouncing to the login form', async () => {
    settings = PROXY_ON;
    const request = fromProxy({ 'remote-user': 'admin' }, { currentUser: ADMIN.id, createdAt: 0 });

    await proxyAuthHook(request);

    expect(await isUnauthorized(request)).toBe(false);
    expect(Date.now() - request.session.createdAt).toBeLessThan(1000);
  });

  it('stays unauthorized for an unknown identity from a trusted proxy', async () => {
    settings = PROXY_ON;
    const request = fromProxy({ 'remote-user': 'nobody' });

    await proxyAuthHook(request);

    expect(await isUnauthorized(request)).toBe(true);
    expect(request.session.currentUser).toBeUndefined();
  });
});
