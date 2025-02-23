import * as userStorage from '../services/storage/userStorage.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'cook... Remove this comment to see the full error message
import cookieSession from 'cookie-session';
import { nanoid } from 'nanoid';
const unauthorized = (res: any) => {
  return res.send(401);
};
const isUnauthorized = (req: any) => {
  return req.session.currentUser == null;
};
const isAdmin = (req: any) => {
  if (!isUnauthorized(req)) {
    const user = userStorage.getUser(req.session.currentUser);
    return user != null && user.isAdmin;
  }
  return false;
};
const authInterceptor = () => {
  return (req: any, res: any, next: any) => {
    if (isUnauthorized(req)) {
      return unauthorized(res);
    } else {
      next();
    }
  };
};
const adminInterceptor = () => {
  return (req: any, res: any, next: any) => {
    if (!isAdmin(req)) {
      return unauthorized(res);
    } else {
      next();
    }
  };
};
const cookieSession$0 = (userId: any) => {
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
