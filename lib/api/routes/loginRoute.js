/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import restana from 'restana';
import * as userStorage from '../../services/storage/userStorage.js';
import * as hasher from '../../services/security/hash.js';
import { trackDemoAccessed } from '../../services/tracking/Tracker.js';
import logger from '../../services/logger.js';
import { getSettings } from '../../services/storage/settingsStorage.js';

const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const loginAttempts = new Map(); // ip -> { count, firstAttempt }

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (forwarded ? forwarded.split(',')[0] : req.socket?.remoteAddress) || 'unknown';
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

const service = restana();
const loginRouter = service.newRouter();
loginRouter.get('/user', async (req, res) => {
  const currentUserId = req.session.currentUser;
  const currentUser = currentUserId == null ? null : userStorage.getUser(currentUserId);
  if (currentUser == null) {
    res.body = {};
  } else {
    res.body = {
      userId: currentUser.id,
      isAdmin: currentUser.isAdmin,
    };
  }
  res.send();
});
loginRouter.post('/', async (req, res) => {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    logger.error(`Login rate limit exceeded for IP ${ip}`);
    res.send(429);
    return;
  }
  const settings = await getSettings();
  const { username, password } = req.body;
  const user = userStorage.getUsers(true).find((user) => user.username === username);
  if (user == null) {
    res.send(401);
    return;
  }
  if (user.password === hasher.hash(password)) {
    if (settings.demoMode) {
      await trackDemoAccessed();
    }

    req.session.currentUser = user.id;
    req.session.createdAt = Date.now();
    loginAttempts.delete(ip);
    userStorage.setLastLoginToNow({ userId: user.id });
    res.send(200);
    return;
  } else {
    logger.error(`User ${username} tried to login, but password was wrong.`);
  }
  res.send(401);
});
loginRouter.post('/logout', async (req, res) => {
  req.session = null;
  res.send(200);
});
export { loginRouter };
