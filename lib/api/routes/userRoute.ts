import restana from 'restana';
import * as userStorage from '#services/storage/userStorage';
import * as jobStorage from '#services/storage/jobStorage';
import { config } from '../../utils';
import { User } from '#types/User.ts';
import { ApiDeleteUserReq, ApiSaveUserReq, ReqWithSession } from '#types/Api.ts';
import { HTTPError } from '../errorHandling';

const service = restana();
const userRouter = service.newRouter();

function checkIfAnyAdminAfterRemovingUser(userIdToBeRemoved: string | undefined | null, allUser: User[]) {
  if (userIdToBeRemoved == null) return true;
  return allUser.filter((user) => user.id !== userIdToBeRemoved && user.isAdmin).length > 0;
}
function checkIfUserToBeRemovedIsLoggedIn(userIdToBeRemoved: string | undefined | null, req: ReqWithSession) {
  if (userIdToBeRemoved == null) return false;
  const currentUser = req.session?.currentUser;
  return currentUser === userIdToBeRemoved;
}
const nullOrEmpty = (str: string | null | undefined) => str == null || str.length === 0;

userRouter.get('/', async (req: ReqWithSession, res) => {
  const users = userStorage.getUsers(false);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(users));
});

userRouter.get('/:userId', async (req: ReqWithSession, res) => {
  const { userId } = req.params as { userId: string };
  const user = userStorage.getUser(userId);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(user));
});

userRouter.delete('/', async (req: ReqWithSession, res) => {
  const { id } = req.body as unknown as ApiDeleteUserReq;
  if (config.demoMode) {
    new HTTPError(res).setStatusCode(403).addError('In demo mode, it is not allowed to remove user.').send();
    return;
  }

  const allUser: User[] = userStorage.getUsers(false);
  if (!checkIfAnyAdminAfterRemovingUser(id, allUser)) {
    new HTTPError(res)
      .setStatusCode(403)
      .addError('You are trying to remove the last admin user. This is prohibited.')
      .send();
    return;
  }
  if (checkIfUserToBeRemovedIsLoggedIn(id, req)) {
    new HTTPError(res).setStatusCode(403).addError('You are trying to remove yourself. This is prohibited.').send();
    return;
  }
  //TODO: Remove also analytics
  jobStorage.removeJobsByUserId(id);
  userStorage.removeUserById(id);
  res.send('');
});

userRouter.post('/', async (req: ReqWithSession, res) => {
  if (config.demoMode) {
    new HTTPError(res).setStatusCode(403).addError('In demo mode, it is not allowed to change or add user.').send();
    return;
  }

  const { username, password, password2, isAdmin, id } = req.body as unknown as ApiSaveUserReq;
  if (password !== password2) {
    new HTTPError(res).setStatusCode(400).addError('Passwords does not match').send();
    return;
  }
  if (nullOrEmpty(username) || nullOrEmpty(password) || nullOrEmpty(password2)) {
    new HTTPError(res).setStatusCode(400).addError('Username and password are mandatory.').send();
    return;
  }
  const allUser: User[] = userStorage.getUsers(false);
  if (!isAdmin && !checkIfAnyAdminAfterRemovingUser(id, allUser)) {
    new HTTPError(res)
      .setStatusCode(400)
      .addError('You cannot change the admin flag for this user as otherwise, there is no other user in the system')
      .send();
    return;
  }
  userStorage.upsertUser({
    id: id,
    username,
    password: password as string,
    isAdmin,
  });
  res.send('');
});
export { userRouter };
