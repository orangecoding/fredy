/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as userStorage from '../services/storage/userStorage.js';
import { getSettings } from '../services/storage/settingsStorage.js';

const DEFAULT_SESSION_TTL_HOURS = 2;

/**
 * Longest session lifetime the cookie is allowed to advertise.
 *
 * The cookie's maxAge is fixed when the session plugin is registered and cannot follow a setting
 * that changes later, so it is set to this ceiling and the server-side check below is the actual
 * authority. A cookie outliving its session is harmless - {@link isUnauthorized} rejects it.
 * @type {number}
 */
export const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/**
 * Build the cookie options handed to the session plugin.
 *
 * A fresh object per call: the plugin writes back into the object it is given while normalising
 * defaults, so a shared (or frozen) one is not safe to hand it.
 *
 * `secure` is resolved per request rather than fixed at startup. It used to follow the configured
 * `baseUrl`, which flagged the cookie `Secure` on every request as soon as an admin entered an
 * https address. Reaching the same instance directly over plain http - typically
 * `http://<lan-ip>:9998` next to a reverse proxy - then failed silently: the session plugin drops
 * a `Secure` cookie on a non-https connection, so `POST /api/login` answered 200 with no
 * `Set-Cookie` at all, the client's follow-up probe reported nobody logged in, and the login form
 * simply reset with no error anywhere.
 *
 * `'auto'` makes the flag follow the protocol the request actually arrived on, so the https entry
 * point keeps its `Secure` cookie and the http one gets a working session. `request.protocol`
 * comes from `X-Forwarded-Proto` while `trustProxy` is on (the default), which every common
 * reverse proxy sets; one that terminates TLS without sending it yields a cookie without `Secure`,
 * which is a downgrade from the ideal but still a login that works.
 *
 * @returns {{maxAge: number, httpOnly: boolean, secure: 'auto', sameSite: 'lax'}}
 */
export function createSessionCookieOptions() {
  return {
    maxAge: SESSION_COOKIE_MAX_AGE,
    httpOnly: true,
    secure: 'auto',
    sameSite: 'lax',
  };
}

/**
 * The configured idle window, read live.
 *
 * `sessionTTL` used to be snapshotted at module load, so changing it in the settings UI appeared
 * to work and did nothing until a restart. `getSettings()` is cache-backed and invalidated on
 * write, so reading it per request costs nothing after the first call.
 *
 * The value comes from a free-text field, so it is parsed defensively - a non-numeric or
 * non-positive value falls back to the default instead of producing NaN, which would make every
 * comparison below false and sessions never expire.
 *
 * @returns {Promise<number>} Idle window in milliseconds.
 */
export async function sessionMaxAge() {
  const settings = await getSettings();
  const ttlHours = Number(settings?.sessionTTL);
  return (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : DEFAULT_SESSION_TTL_HOURS) * 60 * 60 * 1000;
}

/**
 * Returns true when the request has no valid, non-expired session.
 * @param {import('fastify').FastifyRequest} request
 * @returns {Promise<boolean>}
 */
export async function isUnauthorized(request) {
  if (!request.session?.currentUser) return true;
  return Date.now() - (request.session.createdAt || 0) > (await sessionMaxAge());
}

/**
 * Extends the session's idle window by moving its timestamp to now.
 *
 * Called for every authenticated request so expiry behaves as an idle timeout that matches
 * the rolling session cookie. Without this, the timestamp stayed pinned to the login time and
 * actively working users were logged out mid-session once the TTL elapsed.
 *
 * Deliberately not called from the public GET /api/login/user probe: that endpoint only
 * reports whether a session is still valid and must not keep an idle browser tab alive.
 * @param {import('fastify').FastifyRequest} request
 * @returns {void}
 */
export function touchSession(request) {
  if (request.session != null) {
    request.session.createdAt = Date.now();
  }
}

/**
 * Returns true when the session belongs to an admin user.
 *
 * Reads the user `authHook` already resolved for this request. Routes call this two to five times
 * per request, and each call used to be its own `SELECT` with a correlated job-count subquery,
 * plus a session expiry check. Only valid behind `authHook`, which is where the session is
 * validated and `currentUser` is set; without it there is no user and this correctly says false.
 *
 * The cache lives on the request object and dies with it, so `authHook` still reads the database
 * once per request: a permission change made by another user takes effect on the very next
 * request, exactly as before. Do not move this onto the session or into a module-level map - that
 * variant would force the affected user to log out and back in.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {boolean}
 */
export function isAdmin(request) {
  return request.currentUser?.isAdmin === true;
}

/**
 * Fastify preHandler hook - rejects unauthenticated requests with 401.
 *
 * Resolves the session's user once and hangs it on the request, so everything downstream
 * (`isAdmin`, the route handlers) reads it instead of querying again.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export async function authHook(request, reply) {
  if (await isUnauthorized(request)) {
    return reply.code(401).send();
  }
  request.currentUser = userStorage.getUser(request.session.currentUser);
  if (request.currentUser == null) {
    // The session points at a user that no longer exists (deleted while logged in).
    return reply.code(401).send();
  }
  touchSession(request);
}

/**
 * Fastify preHandler hook - rejects non-admin requests with 401.
 * Apply after authHook.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export async function adminHook(request, reply) {
  if (!isAdmin(request)) {
    return reply.code(401).send();
  }
}
