/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as userStorage from '../../services/storage/userStorage.js';
import * as hasher from '../../services/security/hash.js';
import { trackDemoAccessed } from '../../services/tracking/Tracker.js';
import logger from '../../services/logger.js';
import { getSettings } from '../../services/storage/settingsStorage.js';

const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

function getClientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  return (forwarded ? forwarded.split(',')[0] : request.socket?.remoteAddress) || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return false;
  }
  record.count++;
  return record.count > MAX_LOGIN_ATTEMPTS;
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function loginPlugin(fastify) {
  fastify.get('/user', async (request) => {
    const currentUserId = request.session?.currentUser;
    const currentUser = currentUserId == null ? null : userStorage.getUser(currentUserId);
    if (currentUser == null) {
      return {};
    }
    return {
      userId: currentUser.id,
      isAdmin: currentUser.isAdmin,
    };
  });

  fastify.post('/', async (request, reply) => {
    const ip = getClientIp(request);
    if (isRateLimited(ip)) {
      logger.error(`Login rate limit exceeded for IP ${ip}`);
      return reply.code(429).send();
    }
    const settings = await getSettings();
    const { username, password } = request.body;
    const user = userStorage.getUsers(true).find((u) => u.username === username);
    if (user == null) {
      return reply.code(401).send();
    }
    if (user.password === hasher.hash(password)) {
      if (settings.demoMode) {
        await trackDemoAccessed();
      }
      request.session.currentUser = user.id;
      request.session.createdAt = Date.now();
      loginAttempts.delete(ip);
      userStorage.setLastLoginToNow({ userId: user.id });
      return reply.code(200).send();
    } else {
      logger.error(`User ${username} tried to login, but password was wrong.`);
    }
    return reply.code(401).send();
  });

  fastify.post('/logout', async (request, reply) => {
    await request.session.destroy();
    return reply.code(200).send();
  });
}
