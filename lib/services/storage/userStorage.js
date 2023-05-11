import { JSONFileSync } from 'lowdb/node';
import { getDirName } from '../../utils.js';
import * as hasher from '../security/hash.js';
import { nanoid } from 'nanoid';
import * as jobStorage from './jobStorage.js';
import path from 'path';
import LowdashAdapter from './LowDashAdapter.js';

const defaultData = {
    user: [
        //you probably want to change the default password ;)
        {
            id: nanoid(),
            lastLogin: Date.now(),
            username: 'admin',
            password: hasher.hash('admin'),
            isAdmin: true,
        },
    ],
};

const file = path.join(getDirName(), '../', 'db/users.json');
const adapter = new JSONFileSync(file);
const db = new LowdashAdapter(adapter, defaultData);

db.read();

export const getUsers = (withPassword) => {
  const jobs = jobStorage.getJobs();
  return db.chain
    .get('user')
    .value()
    .map((user) => ({
      //we dont want the password in the frontend, even tho it's hashed
      ...user,
      password: withPassword ? user.password : null,
      numberOfJobs: jobs.filter((job) => job.userId === user.id).length,
    }));
};
export const getUser = (id) => {
  const jobs = jobStorage.getJobs();
  const user = db.chain
    .get('user')
    .find((user) => user.id === id)
    .value();
  if (user == null) {
    return null;
  }
  return {
    ...user,
    numberOfJobs: jobs.filter((job) => job.userId === user.id).length,
  };
};
export const upsertUser = ({ username, password, userId, isAdmin }) => {
  const user = db.chain
    .get('user')
    .filter((u) => u.id !== userId)
    .value();
  user.push({
    id: userId || nanoid(),
    username,
    lastLogin: user.lastLogin,
    password: hasher.hash(password),
    isAdmin,
  });
  db.chain.set('user', user).value();
  db.write();
};
export const setLastLoginToNow = ({ userId }) => {
  db.chain
    .get('user')
    .find((u) => u.id === userId)
    .assign({ lastLogin: Date.now() })
    .value();
  db.write();
};
export const removeUser = (userId) => {
  const user = db.chain.get('user').value();
  db.chain
    .set(
      'user',
      user.filter((u) => u.id !== userId)
    )
    .value();
  db.write();
};
