import { JSONFileSync } from 'lowdb/node';
import { config, getDirName } from '../../utils';
import * as hasher from '../security/hash';
import { nanoid } from 'nanoid';
import * as jobStorage from './jobStorage';
import path from 'path';
import LowdashAdapter from './LowDashAdapter';
import { UsersDbData } from './types';
import { User } from '#types/User.ts';

const defaultData: { user: User[] } = {
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

const file: string = path.join(getDirName(), '../', 'db/users.json');
const adapter: JSONFileSync<UsersDbData> = new JSONFileSync(file);
const db: LowdashAdapter<UsersDbData> = new LowdashAdapter(adapter, defaultData);

db.read();

export const getUsers = (withPassword: boolean) => {
  const jobs: { userId: string }[] = jobStorage.getJobs();
  return db.chain
    .get('user')
    .value()
    .map(
      (user: User): User => ({
        //we dont want the password in the frontend, even tho it's hashed
        ...user,
        password: withPassword ? user.password : null,
        numberOfJobs: jobs.filter((job: { userId: string }) => job.userId === user.id).length,
      }),
    );
};
export const getUser = (id: string): User | null => {
  const jobs: { userId: string }[] = jobStorage.getJobs();
  const user: User | undefined = db.chain
    .get('user')
    .find((user: User) => user.id === id)
    .value();
  if (user == null) {
    return null;
  }
  return {
    ...user,
    numberOfJobs: jobs.filter((job: { userId: string }) => job.userId === user.id).length,
  };
};

export const upsertUser = ({
  username,
  password,
  id,
  isAdmin,
}: Omit<User, 'id'> & { id?: string | null | undefined }) => {
  const users: User[] = db.chain
    .get('user')
    .filter((u: User) => u.id !== id)
    .value();
  const newUser: User = {
    id: id || nanoid(),
    username,
    lastLogin: Date.now(),
    password: password ? hasher.hash(password) : undefined,
    isAdmin,
  };
  users.push(newUser);
  db.chain.set('user', users).value();
  db.write();
};

export const setLastLoginToNow = (userId: string) => {
  db.chain
    .get('user')
    .find((u: User) => u.id === userId)
    .assign({ lastLogin: Date.now() })
    .value();
  db.write();
};
export const removeUserById = (userId: string) => {
  const users: User[] = db.chain.get('user').value();
  db.chain
    .set(
      'user',
      users.filter((u: User) => u.id !== userId),
    )
    .value();
  db.write();
};

export const removeUserByUsername = (username: string) => {
  const users: User[] = db.chain.get('user').value();
  db.chain
    .set(
      'user',
      users.filter((u: User) => u.username !== username),
    )
    .value();
  db.write();
};

export const handleDemoUser = () => {
  if (!config.demoMode) {
    /* eslint-disable-next-line no-console */
    console.info('demo mode disabled');
    removeUserByUsername('demo');
  } else {
    /* eslint-disable-next-line no-console */
    console.info('demo mode enabled');
    const demoUser = getUser('demo');
    if (demoUser == null) {
      upsertUser({
        username: 'demo',
        password: 'demo',
        id: nanoid(),
        isAdmin: true,
      });
    }
  }
};
