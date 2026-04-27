/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as userStorage from '../services/storage/userStorage.js';

const SESSION_MAX_AGE = 2 * 60 * 60 * 1000; // 2 hours

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
    reply.code(401).send();
  }
}

/**
 * Fastify preHandler hook - rejects non-admin requests with 401.
 * Apply after authHook.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 */
export async function adminHook(request, reply) {
  if (!isAdmin(request)) {
    reply.code(401).send();
  }
}
