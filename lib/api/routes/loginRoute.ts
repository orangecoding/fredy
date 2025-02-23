import restana from 'restana';
import * as userStorage from '#services/storage/userStorage';
import * as hasher from '#services/security/hash';
import { config } from '../../utils.js';
import { trackDemoAccessed } from '#services/tracking/Tracker';
import { ApiCurrentUserRes, ApiLoginReq, ReqWithSession } from '#types/api.js';
import { User } from '#types/User.js';
import { HTTPError } from '../errorHandling.js';

const service = restana();
const loginRouter = service.newRouter();

loginRouter.get('/user', async (req: ReqWithSession, res) => {
  const currentUserId = req.session?.currentUser;
  const currentUser = currentUserId == null ? null : userStorage.getUser(currentUserId);

  const responseBody: ApiCurrentUserRes = {};
  if (currentUser != null) {
    responseBody.id = currentUser.id;
    responseBody.isAdmin = currentUser.isAdmin;
  }

  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(responseBody));
});

loginRouter.post('/', async (req: ReqWithSession, res) => {
  try {
    const { username, password } = req.body as unknown as ApiLoginReq;
    // eslint-disable-next-line no-console
    console.info(`User ${username} tried to login.`);
    if (username == null || password == null) {
      new HTTPError(res).setStatusCode(400).addError('Username and password are required').send();
      return;
    }

    const user = userStorage.getUsers(true).find((user: User) => user.username === username);

    if (!user) {
      new HTTPError(res).setStatusCode(401).addError('Username or password was wrong').send();
      return;
    }

    if (user.password === hasher.hash(password)) {
      if (config.demoMode) trackDemoAccessed();
      if (req.session == null) {
        new HTTPError(res).setStatusCode(401).addError('An error occurred while trying to login').send();
        return;
      }

      req.session.currentUser = user.id;
      // eslint-disable-next-line no-console
      console.info(`User ${username} logged in.`);
      userStorage.setLastLoginToNow(user.id);
      res.send('');
      return;
    } else {
      console.error(`User ${username} tried to login, but password was wrong.`);
      new HTTPError(res).setStatusCode(401).addError('Username or password was wrong').send();
    }
  } catch (error: unknown) {
    console.error(error);
    new HTTPError(res).setStatusCode(500).addError('Error while trying to login').send();
    return;
  }
});

loginRouter.post('/logout', async (req: ReqWithSession, res) => {
  if (req.session == null) {
    res.send('');
    return;
  }
  req.session.currentUser = null;
  res.send('');
});

export { loginRouter };
