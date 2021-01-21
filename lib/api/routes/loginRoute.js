const service = require('restana')();
const loginRouter = service.newRouter();
const userStorage = require('../../services/storage/userStorage');
const hasher = require('../../services/security/hash');

loginRouter.get('/user', async (req, res) => {
  const currentUserId = req.session.currentUser;
  const isAdmin = currentUserId == null ? false : userStorage.getUser(currentUserId).isAdmin;
  if (currentUserId == null) {
    res.body = {};
  } else {
    res.body = {
      userId: currentUserId,
      isAdmin,
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

exports.loginRouter = loginRouter;
