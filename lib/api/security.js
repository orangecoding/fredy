/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as userStorage from '../services/storage/userStorage.js';
import cookieSession from 'cookie-session';
const SESSION_MAX_AGE = 2 * 60 * 60 * 1000; // 2 hours
const unauthorized = (res) => {
  return res.send(401);
};
const isUnauthorized = (req) => {
  if (req.session.currentUser == null) return true;
  if (Date.now() - req.session.createdAt > SESSION_MAX_AGE) {
    req.session = null;
    return true;
  }
  return false;
};
const isAdmin = (req) => {
  if (!isUnauthorized(req)) {
    const user = userStorage.getUser(req.session.currentUser);
    return user != null && user.isAdmin;
  }
  return false;
};
const authInterceptor = () => {
  return (req, res, next) => {
    if (isUnauthorized(req)) {
      return unauthorized(res);
    } else {
      next();
    }
  };
};
const adminInterceptor = () => {
  return (req, res, next) => {
    if (!isAdmin(req)) {
      return unauthorized(res);
    } else {
      next();
    }
  };
};
const cookieSession$0 = (secret) => {
  return cookieSession({
    name: 'fredy-admin-session',
    keys: [secret],
    maxAge: SESSION_MAX_AGE,
  });
};
export { cookieSession$0 as cookieSession };
export { adminInterceptor };
export { authInterceptor };
export { isUnauthorized };
export { isAdmin };
