import restana from 'restana';
import * as userStorage from '../../services/storage/userStorage.js';
import * as hasher from '../../services/security/hash.js';
const service = restana();
const loginRouter = service.newRouter();
loginRouter.get('/user', async (req, res) => {
  const currentUserId = req.session.currentUser;
  const currentUser = currentUserId == null ? null : userStorage.getUser(currentUserId);
  if (currentUser == null) {
    res.body = {};
  } else {
    res.body = {
      userId: currentUser.id,
      isAdmin: currentUser.isAdmin,
    };
  }
  res.send();
});
loginRouter.post('/', async (req, res) => {
  const { username, password } = req.body;
  const user = userStorage.getUsers(true).find((user) => user.username === username);
  if (user == null) {
    res.send(401);
    return;
  }
  if (user.password === hasher.hash(password)) {
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
  req.session = null;
  res.send(200);
});
export { loginRouter };
