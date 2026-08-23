/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as userStorage from '../../services/storage/userStorage.js';
import * as hasher from '../../services/security/hash.js';
import { trackDemoAccessed } from '../../services/tracking/Tracker.js';
import logger from '../../services/logger.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import { isUnauthorized } from '../security.js';
import { createWindowLimiter, getClientIp } from '../rateLimiter.js';

const MAX_LOGIN_ATTEMPTS = 10;
/**
 * Per-account ceiling, lower than the per-origin one: an attacker spread across many addresses is
 * still only ever guessing at one account's password.
 */
const MAX_ACCOUNT_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const loginAttempts = createWindowLimiter(LOGIN_WINDOW_MS);

/**
 * Apply both ceilings: one per origin address, one per account being guessed at.
 *
 * @param {string} ip
 * @param {unknown} username
 * @returns {boolean} True when the attempt should be rejected.
 */
function isRateLimited(ip, username) {
  const overIpLimit = loginAttempts.hit(`ip:${ip}`, MAX_LOGIN_ATTEMPTS);
  const overAccountLimit =
    typeof username === 'string' && username.length > 0
      ? loginAttempts.hit(`user:${username.toLowerCase()}`, MAX_ACCOUNT_ATTEMPTS)
      : false;
  return overIpLimit || overAccountLimit;
}

/**
 * Clear both counters after a successful login, so a user who mistyped once is not held to the
 * remainder of the window.
 *
 * @param {string} ip
 * @param {unknown} username
 * @returns {void}
 */
function clearAttempts(ip, username) {
  loginAttempts.clear(`ip:${ip}`);
  if (typeof username === 'string' && username.length > 0) {
    loginAttempts.clear(`user:${username.toLowerCase()}`);
  }
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function loginPlugin(fastify) {
  fastify.get('/user', async (request) => {
    // Honor the same hard-expiry check the authenticated routes use. Without this the
    // session cookie keeps rolling and this public endpoint would keep reporting the user
    // as logged in after the session expired, so the client never redirects to login.
    if (await isUnauthorized(request)) {
      return {};
    }
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
    const { username, password } = request.body;
    if (isRateLimited(ip, username)) {
      logger.error(`Login rate limit exceeded for IP ${ip}`);
      return reply.code(429).send();
    }
    const settings = await getSettings();
    const user = userStorage.getUserWithSecretsByUsername(username);
    // An unknown username still pays for a hash verification. Returning early made the two cases
    // distinguishable by response time, which turns this endpoint into a way to enumerate accounts.
    const passwordMatches = await hasher.verify(password, user?.password ?? hasher.DUMMY_HASH);
    if (user != null && passwordMatches) {
      if (settings.demoMode) {
        await trackDemoAccessed();
      }
      request.session.currentUser = user.id;
      request.session.createdAt = Date.now();
      clearAttempts(ip, username);
      userStorage.setLastLoginToNow({ userId: user.id });
      // Transparently upgrade legacy (unsalted SHA-256) hashes to the current
      // salted scheme now that we have the plaintext password in hand.
      if (hasher.needsRehash(user.password)) {
        try {
          const upgraded = await hasher.hash(password);
          userStorage.updatePasswordHash({ userId: user.id, passwordHash: upgraded });
        } catch (err) {
          logger.error(`Failed to upgrade password hash for user ${user.id}: ${err?.message || err}`);
        }
      }
      return reply.code(200).send();
    }
    logger.error(`User ${username} tried to login, but the credentials were wrong.`);
    return reply.code(401).send();
  });

  fastify.post('/logout', async (request, reply) => {
    await request.session.destroy();
    return reply.code(200).send();
  });
}
