import restana from 'restana';
import * as userStorage from '../../services/storage/userStorage.js';
import * as hasher from '../../services/security/hash.js';
import {config} from '../../utils.js';
import {trackDemoAccessed} from '../../services/tracking/Tracker.js';
const service = restana();
const loginRouter = service.newRouter();
loginRouter.get('/user', async (req, res) => {
  // @ts-expect-error TS(2339): Property 'session' does not exist on type 'Incomin... Remove this comment to see the full error message
  const currentUserId = req.session.currentUser;
  const currentUser = currentUserId == null ? null : userStorage.getUser(currentUserId);
  if (currentUser == null) {
    // @ts-expect-error TS(2339): Property 'body' does not exist on type 'ServerResp... Remove this comment to see the full error message
    res.body = {};
  } else {
    // @ts-expect-error TS(2339): Property 'body' does not exist on type 'ServerResp... Remove this comment to see the full error message
    res.body = {
      userId: currentUser.id,
      isAdmin: currentUser.isAdmin,
    };
  }
  res.send();
});
loginRouter.post('/', async (req, res) => {
  // @ts-expect-error TS(2339): Property 'username' does not exist on type 'Body |... Remove this comment to see the full error message
  const { username, password } = req.body;
  const user = userStorage.getUsers(true).find((user: any) => user.username === username);
  if (user == null) {
    res.send(401);
    return;
  }
  if (user.password === hasher.hash(password)) {

    // @ts-expect-error TS(2339): Property 'demoMode' does not exist on type '{}'.
    if(config.demoMode){
      trackDemoAccessed();
    }

    // @ts-expect-error TS(2339): Property 'session' does not exist on type 'Incomin... Remove this comment to see the full error message
    req.session.currentUser = user.id;
    userStorage.setLastLoginToNow({ userId: user.id });
    res.send(200);
    return;
  } else {
    console.error(`User ${username} tried to login, but password was wrong.`);
  }
  res.send(401);
});
loginRouter.post('/logout', async (req, res) => {
  // @ts-expect-error TS(2339): Property 'session' does not exist on type 'Incomin... Remove this comment to see the full error message
  req.session = null;
  res.send(200);
});
export { loginRouter };
