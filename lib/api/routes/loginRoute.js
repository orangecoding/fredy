/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as userStorage from '../../services/storage/userStorage.js';
import * as hasher from '../../services/security/hash.js';
import { trackDemoAccessed, trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import logger from '../../services/logger.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import { cancelTourOnLogout } from '../../services/tour/tourService.js';
import { isUnauthorized, startSession } from '../security.js';
import { createWindowLimiter, getClientIp } from '../rateLimiter.js';
import { clearResetCode, issueResetCode, matchesResetCode } from '../../services/security/passwordResetCode.js';
import { isRunningInDocker } from '../../utils/detectBaseUrl.js';

const MAX_LOGIN_ATTEMPTS = 10;
/**
 * Per-account ceiling, lower than the per-origin one: an attacker spread across many addresses is
 * still only ever guessing at one account's password.
 */
const MAX_ACCOUNT_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const loginAttempts = createWindowLimiter(LOGIN_WINDOW_MS);

/** Longest user name counted as its own key; longer ones are cut, so they cannot bloat the counter. */
const MAX_USERNAME_LENGTH = 200;

/**
 * Apply both ceilings: one per origin address, one per account being guessed at.
 *
 * @param {string} ip
 * @param {unknown} username
 * @returns {boolean} True when the attempt should be rejected.
 */
function isRateLimited(ip, username) {
  if (typeof username === 'string' && username.length > MAX_USERNAME_LENGTH) {
    username = username.slice(0, MAX_USERNAME_LENGTH);
  }
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
      username: currentUser.username,
      isAdmin: currentUser.isAdmin,
    };
  });

  // A login is two short strings. The app-wide 50 MB body limit let a single request park megabytes
  // of user name in the attempt counter for a whole window.
  fastify.post('/', { bodyLimit: 4096 }, async (request, reply) => {
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
      await startSession(request, user.id);
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

  /**
   * "Forgot password?": write a one-time reset code to Fredy's console.
   *
   * One line through `logger.warnConsoleOnly`: like any warning on the console, but never copied
   * into `debug_logs` while debug logging is on, so the code cannot reach the debug bundle people
   * attach to bug reports.
   *
   * Answers the same whether a new code was written or a live one is still waiting, with the time
   * it runs out and whether Fredy runs in Docker, so the form can point at `docker logs` only where
   * that is where the logs are. A code that was guessed to death is not replaced until then, which
   * answers 429.
   *
   * Not limited per address, on purpose: see passwordResetCode.js.
   */
  fastify.post('/reset-code', { bodyLimit: 1024 }, async (request, reply) => {
    const ip = getClientIp(request);
    if ((await getSettings()).demoMode) {
      return reply.code(403).send({ error: 'Password reset is not available in demo mode.' });
    }
    const { code, expiresAt, exhausted } = issueResetCode();
    if (exhausted) {
      return reply.code(429).send();
    }
    if (code != null) {
      logger.warnConsoleOnly(
        `Password reset requested from IP ${ip}. Reset code: ${code} (valid for 3 minutes, works once).`,
      );
      await trackPoi(TRACKING_POIS.PASSWORD_RESET_REQUESTED);
    }
    return reply.send({ expiresAt, docker: isRunningInDocker() });
  });

  /**
   * Set a new password with the code `POST /reset-code` wrote to the console.
   *
   * The input is checked before the code, so a typo in the passwords costs no guess. The code is
   * checked before the user name, so nobody without the code learns which names exist. A right
   * code with an unknown name is kept for another try; a right code with a known name is used up
   * before the first await, so a second request cannot reuse it while the hash is computed.
   */
  fastify.post('/reset-password', { bodyLimit: 4096 }, async (request, reply) => {
    const ip = getClientIp(request);
    if ((await getSettings()).demoMode) {
      return reply.code(403).send({ error: 'Password reset is not available in demo mode.' });
    }
    const { password, password2, code } = request.body ?? {};
    // Trimmed like the login form trims it.
    const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
    if (username === '' || typeof password !== 'string' || password === '' || typeof code !== 'string') {
      return reply.code(400).send({ error: 'User name, new password and code are mandatory.' });
    }
    if (password !== password2) {
      return reply.code(400).send({ error: 'Passwords do not match.' });
    }

    const user = userStorage.getUserByUsername(username);
    if (!matchesResetCode(code)) {
      logger.error(`A wrong or expired password reset code was entered from IP ${ip}.`);
      return reply.code(403).send({ error: 'The reset code is wrong or expired.' });
    }
    if (user == null) {
      return reply.code(404).send({ error: 'There is no user with this name.' });
    }
    clearResetCode();

    // Through upsertUser, so every session of the account ends with the old password, as it does
    // when an admin sets a new one.
    await userStorage.upsertUser({ userId: user.id, username: user.username, password, isAdmin: user.isAdmin });
    clearAttempts(ip, user.username);
    logger.warn(`The password of user ${user.username} was reset with a reset code from IP ${ip}.`);
    return reply.send();
  });

  fastify.post('/logout', async (request, reply) => {
    // A tour still running when its session ends is over: nobody is left to finish it, and its
    // example listings must not sit in the account until the cleanup cron gets round to them.
    try {
      cancelTourOnLogout(request.session?.currentUser);
    } catch (error) {
      logger.warn('Could not cancel the onboarding tour on logout', error);
    }
    await request.session.destroy();
    return reply.code(200).send();
  });
}
