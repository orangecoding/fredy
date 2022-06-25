import userStorage from '../services/storage/userStorage.js';
import cookieSession from 'cookie-session';
import { nanoid } from 'nanoid';

const unauthorized = (res) => {
  return res.send(401);
};

export const  isUnauthorized = (req) => {
  return req.session.currentUser == null;
};

export const  isAdmin = (req) => {
  if (!isUnauthorized(req)) {
    const user = userStorage.getUser(req.session.currentUser);
    return user != null && user.isAdmin;
  }
  return false;
};

export const  authInterceptor = () => {
  return (req, res, next) => {
    if (isUnauthorized(req)) {
      return unauthorized(res);
    } else {
      next();
    }
  };
};

export const  adminInterceptor = () => {
  return (req, res, next) => {
    if (!isAdmin(req)) {
      return unauthorized(res);
    } else {
      next();
    }
  };
};

export const cookieSessions = (userId) => {
  return cookieSession({
    name: 'fredy-admin-session',
    keys: ['fredy', 'super', 'fancy', 'key', nanoid()],
    userId,
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  });
};

