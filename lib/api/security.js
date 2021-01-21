const userStorage = require('../services/storage/userStorage');
const cookieSession = require('cookie-session');
const { nanoid } = require('nanoid');

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

exports.cookieSession = (userId) => {
  return cookieSession({
    name: 'fredy-admin-session',
    keys: ['fredy', 'super', 'fancy', 'key', nanoid()],
    userId,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });
};

exports.adminInterceptor = adminInterceptor;
exports.authInterceptor = authInterceptor;
exports.isUnauthorized = isUnauthorized;
exports.isAdmin = isAdmin;
