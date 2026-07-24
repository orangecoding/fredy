/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as userStorage from '../services/storage/userStorage.js';
import { getSettings } from '../services/storage/settingsStorage.js';

const DEFAULT_SESSION_TTL_HOURS = 2;

const settings = await getSettings();

/**
 * Idle window after which a session is rejected, derived from the configured `sessionTTL`.
 *
 * This is the single source of truth for session expiry: api.js uses the same value as the
 * session cookie's maxAge. Previously this module hard-coded two hours while the cookie used
 * the setting, which silently capped any configured TTL above two hours.
 *
 * `sessionTTL` comes from a free-text settings field, so it is parsed defensively - a
 * non-numeric or non-positive value falls back to the default instead of producing NaN,
 * which would make every comparison below false and sessions never expire.
 *
 * Changing the setting requires a restart, as documented in the settings UI.
 * @type {number}
 */
const ttlHours = Number(settings.sessionTTL);
export const SESSION_MAX_AGE =
  (Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : DEFAULT_SESSION_TTL_HOURS) * 60 * 60 * 1000;

/**
 * Returns true when the request has no valid, non-expired session.
 * @param {import('fastify').FastifyRequest} request
 * @returns {boolean}
 */
export function isUnauthorized(request) {
  if (!request.session?.currentUser) return true;
  if (Date.now() - (request.session.createdAt || 0) > SESSION_MAX_AGE) return true;
  return false;
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
 * @param {import('fastify').FastifyRequest} request
 * @returns {boolean}
 */
export function isAdmin(request) {
  if (isUnauthorized(request)) return false;
  const user = userStorage.getUser(request.session.currentUser);
  return user != null && user.isAdmin;
}

/**
 * Fastify preHandler hook - rejects unauthenticated requests with 401.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export async function authHook(request, reply) {
  if (isUnauthorized(request)) {
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
