/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import net from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import * as userStorage from '../services/storage/userStorage.js';
import { getSettings } from '../services/storage/settingsStorage.js';
import logger from '../services/logger.js';
import { isUnauthorized } from './security.js';

/**
 * Reverse-proxy ("forward auth") sign-in.
 *
 * An identity-aware proxy such as Pangolin, Authelia or Authentik authenticates the user at the
 * edge and forwards the verified identity in a request header (`Remote-User` by convention). When
 * enabled, Fredy accepts that header *only* from configured trusted proxies - checked against the
 * TCP peer address, never against `X-Forwarded-For` - and, optionally, only when a shared-secret
 * header matches as well. The header is mapped onto an **existing** Fredy user; nothing is created
 * or elevated. Everything else (session lifetime, admin checks, MCP tokens) is unchanged.
 *
 * Off by default. See README "Reverse Proxy Sign-in".
 */

/** The header an identity-aware proxy puts the authenticated username in, by convention. */
export const DEFAULT_PROXY_AUTH_USER_HEADER = 'Remote-User';

/** The settings keys this feature owns, as the System page saves them. */
export const PROXY_AUTH_SETTINGS = [
  'proxyAuthEnabled',
  'proxyAuthTrustedProxies',
  'proxyAuthUserHeader',
  'proxyAuthSecretHeader',
  'proxyAuthSecret',
];

/** RFC 7230 token: what a header field name may consist of. */
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Turn the operator's trusted-proxy text into a BlockList.
 *
 * Accepts single addresses and CIDR ranges, IPv4 and IPv6, separated by commas, semicolons or
 * whitespace. Throws on anything that does not parse: a typo must not quietly shrink the trust
 * boundary to nothing (or, worse, be "fixed" into something broader).
 *
 * @param {string} text The `proxyAuthTrustedProxies` setting.
 * @returns {import('node:net').BlockList}
 */
export function parseTrustedProxies(text) {
  const list = new net.BlockList();
  const entries = String(text ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  for (const entry of entries) {
    const [address, prefix] = entry.split('/');
    const family = net.isIPv4(address) ? 'ipv4' : net.isIPv6(address) ? 'ipv6' : null;
    if (family == null) throw new Error(`Not an IP address: ${entry}`);
    if (prefix == null) {
      list.addAddress(address, family);
      continue;
    }
    const bits = Number(prefix);
    const maxBits = family === 'ipv4' ? 32 : 128;
    if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) throw new Error(`Bad prefix length: ${entry}`);
    list.addSubnet(address, bits, family);
  }
  return list;
}

// The trust list is parsed from a free-text setting on every request that has no valid session.
// The setting changes about never, so the parsed form is kept keyed by the raw text; a changed
// setting simply misses the cache once. Unparseable text is cached as null: trust nobody.
let trustedCache = { text: undefined, list: null };

/**
 * @param {string} text The `proxyAuthTrustedProxies` setting.
 * @returns {import('node:net').BlockList|null} Null when the setting does not parse.
 */
function trustedProxies(text) {
  if (trustedCache.text !== text) {
    let list = null;
    try {
      list = parseTrustedProxies(text);
    } catch {
      // Surfaced to the operator by validateProxyAuthSettings on save; at request time, fail closed.
    }
    trustedCache = { text, list };
  }
  return trustedCache.list;
}

/**
 * The TCP peer address, with the `::ffff:` wrapper removed that dual-stack listeners put around
 * IPv4 peers. Deliberately not `request.ip`: with `trustProxy` on that comes from
 * `X-Forwarded-For`, which is exactly what an attacker behind the proxy controls.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {{address: string, family: 'ipv4'|'ipv6'}|null}
 */
function peerAddress(request) {
  const raw = request.socket?.remoteAddress;
  if (typeof raw !== 'string') return null;
  const address = raw.startsWith('::ffff:') && net.isIPv4(raw.slice(7)) ? raw.slice(7) : raw;
  if (net.isIPv4(address)) return { address, family: 'ipv4' };
  if (net.isIPv6(address)) return { address, family: 'ipv6' };
  return null;
}

/**
 * A header's single string value, or null when it is absent, empty or repeated.
 * @param {import('fastify').FastifyRequest} request
 * @param {string} name
 * @returns {string|null}
 */
function headerValue(request, name) {
  const value = request.headers?.[name.toLowerCase()];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Constant-time string comparison that also hides the length from timing.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function secretEquals(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Check the proxy-auth settings as an admin is about to save them.
 *
 * @param {Record<string, any>} settings The settings being saved (only the proxyAuth* keys matter).
 * @returns {string|null} A human-readable problem, or null when they are fine.
 */
export function validateProxyAuthSettings(settings) {
  if (settings.proxyAuthEnabled !== true) return null;
  for (const name of ['proxyAuthUserHeader', 'proxyAuthSecretHeader']) {
    const value = settings[name];
    if (value != null && value !== '' && !HEADER_NAME.test(String(value))) {
      return `${name} is not a valid HTTP header name.`;
    }
  }
  // An empty list parses fine but trusts nobody; with the feature enabled that is a mistake.
  if (String(settings.proxyAuthTrustedProxies ?? '').trim() === '') {
    return 'proxyAuthTrustedProxies must name at least one trusted proxy address or range.';
  }
  try {
    parseTrustedProxies(settings.proxyAuthTrustedProxies);
  } catch (err) {
    return `proxyAuthTrustedProxies: ${err.message}`;
  }
  return null;
}

/**
 * Prepare the proxy-auth keys of an incoming settings save: normalise, then validate against the
 * merged view, since a request may flip the switch without resending the trusted-proxy list or
 * vice versa.
 *
 * The shared secret is write-only - it never travels back to the browser (see
 * `getPublicSettings`) - so the form cannot echo it and an empty field means "keep the current
 * one" rather than "clear it". Clearing happens by emptying the secret *header* name.
 *
 * @param {Record<string, any>} incoming The request body; mutated in place.
 * @param {Record<string, any>} current The settings as stored.
 * @returns {string|null} A human-readable problem, or null when the save may proceed.
 */
export function prepareProxyAuthSettings(incoming, current) {
  if (incoming.proxyAuthSecret === '') {
    delete incoming.proxyAuthSecret;
  }
  return validateProxyAuthSettings({ ...current, ...incoming });
}

/**
 * The Fredy user the proxy vouches for on this request, or null.
 *
 * Null means "no opinion" - the caller falls back to the normal session check. It is returned for
 * every condition that is not a clean match: feature off, untrusted peer, missing or malformed
 * headers, wrong secret, unknown user. Nothing here is written; establishing the session is the
 * caller's job so the decision stays testable without a Fastify instance.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {Record<string, any>} settings Global settings (`getSettings()`).
 * @returns {{id: string, username: string, isAdmin: boolean}|null}
 */
export function resolveProxyUser(request, settings) {
  if (settings?.proxyAuthEnabled !== true) return null;

  const peer = peerAddress(request);
  const trusted = peer == null ? null : trustedProxies(settings.proxyAuthTrustedProxies);
  if (trusted == null || !trusted.check(peer.address, peer.family)) return null;

  const secretHeader = settings.proxyAuthSecretHeader;
  if (typeof secretHeader === 'string' && secretHeader !== '') {
    const expected = settings.proxyAuthSecret;
    // A secret header name without a secret is a half-finished configuration: fail closed.
    if (typeof expected !== 'string' || expected === '') return null;
    const presented = headerValue(request, secretHeader);
    if (presented == null || !secretEquals(presented, expected)) return null;
  }

  const username = headerValue(request, settings.proxyAuthUserHeader || DEFAULT_PROXY_AUTH_USER_HEADER);
  if (username == null) return null;
  return userStorage.getUserByUsername(username);
}

/**
 * Fastify preHandler hook - signs the request in from a trusted proxy's identity header.
 *
 * Registered once for the whole server, ahead of the route-level `authHook`, so both the protected
 * API and the public `GET /api/login/user` probe (which decides whether the SPA shows the login
 * form) see the session. A valid session always wins over the proxy header, so an explicitly
 * logged-in user is never silently switched. Establishing the session is the same three writes
 * `POST /api/login` does after a successful password check.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {Promise<void>}
 */
export async function proxyAuthHook(request) {
  const settings = await getSettings();
  if (settings?.proxyAuthEnabled !== true || request.session == null) return;
  if (!(await isUnauthorized(request))) return;
  const user = resolveProxyUser(request, settings);
  if (user == null) return;
  request.session.currentUser = user.id;
  request.session.createdAt = Date.now();
  userStorage.setLastLoginToNow({ userId: user.id });
  logger.info(`User ${user.username} signed in via trusted proxy ${request.socket?.remoteAddress}.`);
}
