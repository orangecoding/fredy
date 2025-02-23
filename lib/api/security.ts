import * as userStorage from '../services/storage/userStorage.js';
import cookieSession from 'cookie-session';
import { nanoid } from 'nanoid';
const unauthorized = (res) => {
  return res.send(401);
};
const isUnauthorized = (req) => {
  return req.session.currentUser == null;
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
const cookieSession$0 = (userId) => {
  return cookieSession({
    name: 'fredy-admin-session',
    keys: ['fredy', 'super', 'fancy', 'key', nanoid()],
    userId,
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  });
};
export { cookieSession$0 as cookieSession };
export { adminInterceptor };
export { authInterceptor };
export { isUnauthorized };
export { isAdmin };
