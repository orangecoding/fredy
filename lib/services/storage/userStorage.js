const path = require('path');
const DB_PATH = path.dirname(require.main.filename) + '/db/users.json';
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync(DB_PATH);
const low = require('lowdb');
const db = low(adapter);
const hasher = require('../security/hash');
const { nanoid } = require('nanoid');
const jobStorage = require('./jobStorage');

db.defaults({
  user: [
    //you probably want to change the default password ;)
    {
      id: nanoid(),
      lastLogin: Date.now(),
      username: 'admin',
      password: hasher.hash('admin'),
      isAdmin: true,
      isDemo: false,
    },
  ],
}).write();

exports.getUsers = (withPassword) => {
  const jobs = jobStorage.getJobs();
  return db
    .get('user')
    .value()
    .map((user) => ({
      //we dont want the password in the frontend, even tho it's hashed
      ...user,
      password: withPassword ? user.password : null,
      numberOfJobs: jobs.filter((job) => job.userId === user.id).length,
    }));
};

exports.getUser = (id) => {
  const jobs = jobStorage.getJobs();
  const user = db
    .get('user')
    .value()
    .find((user) => user.id === id);
  if (user == null) {
    return null;
  }
  return {
    ...user,
    numberOfJobs: jobs.filter((job) => job.userId === user.id).length,
  };
};

exports.upsertUser = ({ username, password, userId, isAdmin }) => {
  const user = db
    .get('user')
    .value()
    .filter((u) => u.id !== userId);

  user.push({
    id: userId || nanoid(),
    username,
    lastLogin: user.lastLogin,
    password: hasher.hash(password),
    isAdmin,
  });

  db.set('user', user).write();
};

exports.setLastLoginToNow = ({ userId }) => {
  db.get('user')
    .find((u) => u.id === userId)
    .assign({ lastLogin: Date.now() })
    .write();
};

exports.removeUser = (userId) => {
  const user = db.get('user').value();
  db.set(
    'user',
    user.filter((u) => u.id !== userId)
  ).write();
};
