import { JSONFileSync } from 'lowdb/node';
import {config, getDirName} from '../../utils.js';
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
        {
            id: nanoid(),
            lastLogin: Date.now(),
            username: 'demo',
            password: hasher.hash('demo'),
            isAdmin: true,
        },
    ],
};

const file = path.join(getDirName(), '../', 'db/users.json');
const adapter = new JSONFileSync(file);
const db = new LowdashAdapter(adapter, defaultData);

db.read();

export const getUsers = (withPassword: any) => {
  const jobs = jobStorage.getJobs();
  return db.chain
    .get('user')
    .value()
    .map((user: any) => ({
    //we dont want the password in the frontend, even tho it's hashed
    ...user,

    password: withPassword ? user.password : null,
    numberOfJobs: jobs.filter((job: any) => job.userId === user.id).length
  }));
};
export const getUser = (id: any) => {
  const jobs = jobStorage.getJobs();
  const user = db.chain
    .get('user')
    .find((user: any) => user.id === id)
    .value();
  if (user == null) {
    return null;
  }
  return {
    ...user,
    numberOfJobs: jobs.filter((job: any) => job.userId === user.id).length,
  };
};
export const upsertUser = ({
  username,
  password,
  userId,
  isAdmin
}: any) => {
  const user = db.chain
    .get('user')
    .filter((u: any) => u.id !== userId)
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
export const setLastLoginToNow = ({
  userId
}: any) => {
  db.chain
    .get('user')
    .find((u: any) => u.id === userId)
    .assign({ lastLogin: Date.now() })
    .value();
  db.write();
};
export const removeUser = (userId: any) => {
  const user = db.chain.get('user').value();
  db.chain
    .set(
      'user',
      user.filter((u: any) => u.id !== userId)
    )
    .value();
  db.write();
};

export const handleDemoUser = () => {
    // @ts-expect-error TS(2339): Property 'demoMode' does not exist on type '{}'.
    if(!config.demoMode){
        const user = db.chain.get('user').value();
        db.chain.get('user').value();
        db.chain.set('user', user.filter((u: any) => u.username !== 'demo')).value();
        db.write();
    }else {
        const demoUser = db.chain
            .get('user')
            .filter((u: any) => u.username === 'demo')
            .value();
        if (demoUser == null || demoUser.length === 0) {
            db.chain.get('user')
                .value()
                .push({
                    id: nanoid(),
                    username: 'demo',
                    password: hasher.hash('demo'),
                    isAdmin: true,
                });
            db.write();
        }
    }
};

