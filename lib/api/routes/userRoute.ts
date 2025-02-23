import restana from 'restana';
import * as userStorage from '../../services/storage/userStorage.js';
import * as jobStorage from '../../services/storage/jobStorage.js';
import {config} from '../../utils.js';
const service = restana();
const userRouter = service.newRouter();
function checkIfAnyAdminAfterRemovingUser(userIdToBeRemoved: any, allUser: any) {
  return allUser.filter((user: any) => user.id !== userIdToBeRemoved && user.isAdmin).length > 0;
}
function checkIfUserToBeRemovedIsLoggedIn(userIdToBeRemoved: any, req: any) {
  return req.session.currentUser === userIdToBeRemoved;
}
const nullOrEmpty = (str: any) => str == null || str.length === 0;
userRouter.get('/', async (req, res) => {
  // @ts-expect-error TS(2339): Property 'body' does not exist on type 'ServerResp... Remove this comment to see the full error message
  res.body = userStorage.getUsers(false);
  res.send();
});
userRouter.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  // @ts-expect-error TS(2339): Property 'body' does not exist on type 'ServerResp... Remove this comment to see the full error message
  res.body = userStorage.getUser(userId);
  res.send();
});
userRouter.delete('/', async (req, res) => {
  // @ts-expect-error TS(2339): Property 'demoMode' does not exist on type '{}'.
  if(config.demoMode){
    res.send(new Error('In demo mode, it is not allowed to remove user.'));
    return;
  }

  // @ts-expect-error TS(2339): Property 'userId' does not exist on type 'Body | u... Remove this comment to see the full error message
  const { userId } = req.body;
  const allUser = userStorage.getUsers(false);
  if (!checkIfAnyAdminAfterRemovingUser(userId, allUser)) {
    res.send(new Error('You are trying to remove the last admin user. This is prohibited.'));
    return;
  }
  if (checkIfUserToBeRemovedIsLoggedIn(userId, req)) {
    res.send(new Error('You are trying to remove yourself. This is prohibited.'));
    return;
  }
  //TODO: Remove also analytics
  jobStorage.removeJobsByUserId(userId);
  userStorage.removeUser(userId);
  res.send();
});
userRouter.post('/', async (req, res) => {

  // @ts-expect-error TS(2339): Property 'demoMode' does not exist on type '{}'.
  if(config.demoMode){
      res.send(new Error('In demo mode, it is not allowed to change or add user.'));
      return;
  }

  // @ts-expect-error TS(2339): Property 'username' does not exist on type 'Body |... Remove this comment to see the full error message
  const { username, password, password2, isAdmin, userId } = req.body;
  if (password !== password2) {
    res.send(new Error('Passwords does not match'));
    return;
  }
  if (nullOrEmpty(username) || nullOrEmpty(password) || nullOrEmpty(password2)) {
    res.send(new Error('Username and password are mandatory.'));
    return;
  }
  const allUser = userStorage.getUsers(false);
  if (!isAdmin && !checkIfAnyAdminAfterRemovingUser(userId, allUser)) {
    res.send(
      new Error('You cannot change the admin flag for this user as otherwise, there is no other user in the system')
    );
    return;
  }
  userStorage.upsertUser({
    userId,
    username,
    password,
    isAdmin,
  });
  res.send();
});
export { userRouter };
