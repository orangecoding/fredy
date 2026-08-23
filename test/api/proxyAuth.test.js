/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/services/storage/userStorage.js', () => ({
  getUserByUsername: vi.fn(),
}));

import { getUserByUsername } from '../../lib/services/storage/userStorage.js';
import {
  resolveProxyUser,
  parseTrustedProxies,
  validateProxyAuthSettings,
  prepareProxyAuthSettings,
  DEFAULT_PROXY_AUTH_USER_HEADER,
} from '../../lib/api/proxyAuth.js';

const ADMIN = { id: 'user-1', username: 'admin', isAdmin: true };

const enabled = (overrides = {}) => ({
  proxyAuthEnabled: true,
  proxyAuthTrustedProxies: '172.16.0.0/12, 10.0.0.5',
  ...overrides,
});

/**
 * A request as the proxy-auth code sees it: the TCP peer address and the headers (lower-cased,
 * as Node hands them to Fastify).
 */
const request = (remoteAddress, headers = {}) => ({
  socket: { remoteAddress },
  headers: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])),
});

beforeEach(() => {
  getUserByUsername.mockReset();
  getUserByUsername.mockImplementation((username) => (username === 'admin' ? ADMIN : null));
});

describe('parseTrustedProxies', () => {
  it('accepts single addresses and CIDR ranges, v4 and v6, in any separator style', () => {
    const list = parseTrustedProxies('172.16.0.0/12, 10.0.0.5\n fd00::/8;::1');
    expect(list.check('172.31.255.254')).toBe(true);
    expect(list.check('10.0.0.5')).toBe(true);
    expect(list.check('10.0.0.6')).toBe(false);
    expect(list.check('fd00::1', 'ipv6')).toBe(true);
    expect(list.check('::1', 'ipv6')).toBe(true);
    expect(list.check('192.168.1.1')).toBe(false);
  });

  it('throws on garbage so misconfiguration is loud rather than silently trusting nobody', () => {
    expect(() => parseTrustedProxies('not-an-ip')).toThrow();
    expect(() => parseTrustedProxies('10.0.0.0/33')).toThrow();
  });
});

describe('resolveProxyUser', () => {
  it('returns null when the feature is off, whatever the headers say', () => {
    const req = request('172.16.51.1', { 'Remote-User': 'admin' });
    expect(resolveProxyUser(req, { proxyAuthEnabled: false })).toBeNull();
    expect(resolveProxyUser(req, {})).toBeNull();
    expect(getUserByUsername).not.toHaveBeenCalled();
  });

  it('maps the identity header to an existing user when the peer is a trusted proxy', () => {
    const req = request('172.16.51.1', { 'Remote-User': 'admin' });
    expect(resolveProxyUser(req, enabled())).toEqual(ADMIN);
  });

  it('unwraps IPv4-mapped IPv6 peer addresses (dual-stack listeners)', () => {
    const req = request('::ffff:172.16.51.1', { 'Remote-User': 'admin' });
    expect(resolveProxyUser(req, enabled())).toEqual(ADMIN);
  });

  it('ignores the header when the peer is not a trusted proxy', () => {
    const req = request('192.168.178.20', { 'Remote-User': 'admin' });
    expect(resolveProxyUser(req, enabled())).toBeNull();
    expect(getUserByUsername).not.toHaveBeenCalled();
  });

  it('trusts nobody when no trusted proxies are configured, even if enabled', () => {
    const req = request('172.16.51.1', { 'Remote-User': 'admin' });
    expect(resolveProxyUser(req, enabled({ proxyAuthTrustedProxies: '' }))).toBeNull();
    expect(resolveProxyUser(req, enabled({ proxyAuthTrustedProxies: 'garbage' }))).toBeNull();
  });

  it('never creates users: an unknown identity yields null', () => {
    const req = request('172.16.51.1', { 'Remote-User': 'stranger' });
    expect(resolveProxyUser(req, enabled())).toBeNull();
  });

  it('reads the header named in the settings, defaulting to Remote-User', () => {
    expect(DEFAULT_PROXY_AUTH_USER_HEADER).toBe('Remote-User');
    const req = request('172.16.51.1', { 'X-Authentik-Username': 'admin', 'Remote-User': 'stranger' });
    expect(resolveProxyUser(req, enabled({ proxyAuthUserHeader: 'X-Authentik-Username' }))).toEqual(ADMIN);
  });

  it('ignores an empty or multi-valued identity header', () => {
    expect(resolveProxyUser(request('172.16.51.1', { 'Remote-User': '' }), enabled())).toBeNull();
    expect(resolveProxyUser(request('172.16.51.1', { 'Remote-User': ['admin', 'x'] }), enabled())).toBeNull();
  });

  it('requires the shared secret header to match when one is configured', () => {
    const settings = enabled({ proxyAuthSecretHeader: 'X-Fredy-Proxy-Secret', proxyAuthSecret: 's3cret' });
    const base = { 'Remote-User': 'admin' };
    expect(resolveProxyUser(request('172.16.51.1', base), settings)).toBeNull();
    expect(resolveProxyUser(request('172.16.51.1', { ...base, 'X-Fredy-Proxy-Secret': 'wrong' }), settings)).toBeNull();
    expect(resolveProxyUser(request('172.16.51.1', { ...base, 'X-Fredy-Proxy-Secret': 's3cret' }), settings)).toEqual(
      ADMIN,
    );
  });

  it('refuses to run with a secret header name but no secret (fail closed)', () => {
    const settings = enabled({ proxyAuthSecretHeader: 'X-Fredy-Proxy-Secret', proxyAuthSecret: '' });
    const req = request('172.16.51.1', { 'Remote-User': 'admin', 'X-Fredy-Proxy-Secret': '' });
    expect(resolveProxyUser(req, settings)).toBeNull();
  });
});

describe('resolveProxyUser trust-list cache', () => {
  it('follows a changed trusted-proxy setting without a restart', () => {
    const req = request('192.168.1.9', { 'Remote-User': 'admin' });
    expect(resolveProxyUser(req, enabled())).toBeNull();
    expect(resolveProxyUser(req, enabled({ proxyAuthTrustedProxies: '192.168.1.0/24' }))).toEqual(ADMIN);
    expect(resolveProxyUser(req, enabled())).toBeNull();
  });
});

describe('prepareProxyAuthSettings', () => {
  it('drops an empty secret so the stored one survives the save', () => {
    const incoming = { proxyAuthEnabled: true, proxyAuthSecret: '' };
    expect(prepareProxyAuthSettings(incoming, { proxyAuthTrustedProxies: '10.0.0.1' })).toBeNull();
    expect(incoming).not.toHaveProperty('proxyAuthSecret');
  });

  it('validates the merged view, so enabling without resending the list is caught', () => {
    expect(prepareProxyAuthSettings({ proxyAuthEnabled: true }, {})).toMatch(/trusted/i);
    expect(prepareProxyAuthSettings({ proxyAuthEnabled: true }, { proxyAuthTrustedProxies: '10.0.0.1' })).toBeNull();
  });
});

describe('validateProxyAuthSettings', () => {
  it('accepts a disabled block without looking at the rest', () => {
    expect(validateProxyAuthSettings({ proxyAuthEnabled: false, proxyAuthTrustedProxies: 'garbage' })).toBeNull();
  });

  it('requires a parseable, non-empty trusted proxy list when enabled', () => {
    expect(validateProxyAuthSettings(enabled({ proxyAuthTrustedProxies: '' }))).toMatch(/trusted/i);
    expect(validateProxyAuthSettings(enabled({ proxyAuthTrustedProxies: 'nope' }))).toMatch(/trusted/i);
    expect(validateProxyAuthSettings(enabled())).toBeNull();
  });

  it('rejects header names that are not valid HTTP tokens', () => {
    expect(validateProxyAuthSettings(enabled({ proxyAuthUserHeader: 'Remote User' }))).toMatch(/header/i);
    expect(validateProxyAuthSettings(enabled({ proxyAuthSecretHeader: 'x:y' }))).toMatch(/header/i);
    expect(validateProxyAuthSettings(enabled({ proxyAuthUserHeader: 'X-Forwarded-User' }))).toBeNull();
  });
});
