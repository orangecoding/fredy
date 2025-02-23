import { ReqWithSession } from '#types/api.ts';
import * as userStorage from '../services/storage/userStorage';
import cookieSession from 'cookie-session';
import { nanoid } from 'nanoid';
import restana from 'restana';

const unauthorized = (res: restana.Response<restana.Protocol.HTTP>) => {
  res.send(401);
};

const isUnauthorized = (req: ReqWithSession) => {
  return !req.session || !req.session.currentUser;
};

const isAdmin = (req: ReqWithSession) => {
  if (!isUnauthorized(req) && req.session?.currentUser) {
    const user = userStorage.getUser(req.session.currentUser);
    return user != null && user.isAdmin;
  }
  return false;
};

const authInterceptor = () => {
  return (req: ReqWithSession, res: restana.Response<restana.Protocol.HTTP>, next: (err?: Error) => void) => {
    if (isUnauthorized(req)) {
      return unauthorized(res);
    } else {
      next();
    }
  };
};

const adminInterceptor = () => {
  return (req: ReqWithSession, res: restana.Response<restana.Protocol.HTTP>, next: (err?: Error) => void) => {
    if (!isAdmin(req)) {
      return unauthorized(res);
    } else {
      next();
    }
  };
};

const cookieSession$0 = () => {
  return cookieSession({
    name: 'fredy-admin-session',
    keys: ['fredy', 'super', 'fancy', 'key', nanoid()],
    maxAge: 8 * 60 * 60 * 1000,
  }) as unknown as restana.RequestHandler<restana.Protocol.HTTP>;
};

export { cookieSession$0 as cookieSession };
export { adminInterceptor };
export { authInterceptor };
export { isUnauthorized };
export { isAdmin };
