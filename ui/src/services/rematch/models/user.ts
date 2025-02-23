import { User } from '#types/User.ts';
import { UserState } from 'ui/src/types';
import { xhrGet, xhrDelete, parseError } from '../../xhr';
import { RootModel } from '../store';
import { RematchDispatch, RematchRootState } from '@rematch/core';
import { ApiDeleteUserReq } from '#types/api.ts';

export interface UserSpecificModel {
  state: UserState;
  reducers: {
    setUsers: (state: UserState, payload: User[]) => UserState;
    setCurrentUser: (state: UserState, payload: User) => UserState;
  };
  effects: (dispatch: RematchDispatch<RootModel>) => {
    getUsers: (payload: void, rootState: RematchRootState<RootModel>) => Promise<void>;
    getCurrentUser: (payload: void, rootState: RematchRootState<RootModel>) => Promise<void>;
    removeUser: (payload: string, rootState: RematchRootState<RootModel>) => Promise<void>;
  };
}

export const user: UserSpecificModel = {
  state: {
    users: [],
    currentUser: null,
  } as UserState,
  reducers: {
    setUsers: (state: UserState, payload: User[]) => ({
      ...state,
      users: payload,
    }),
    setCurrentUser: (state: UserState, payload: User) => ({
      ...state,
      currentUser: Object.freeze(payload),
    }),
  },
  effects: (dispatch: RematchDispatch<RootModel>) => ({
    async getUsers() {
      try {
        const response = await xhrGet<User[]>('/api/admin/users');
        const users = response.json;
        dispatch.user.setUsers(users);
      } catch (error) {
        console.error('Error while trying to get resource for api/admin/users:', error);
      }
    },
    async getCurrentUser() {
      try {
        const response = await xhrGet<User>('/api/login/user');
        const user = response.json;
        dispatch.user.setCurrentUser(user);
      } catch (error) {
        console.error('Failed to get current user', error);
      }
    },
    async removeUser(userId: string) {
      xhrDelete<ApiDeleteUserReq>(`/api/admin/users`, { id: userId })
        .then(async () => {
          await dispatch.user.getUsers();
        })
        .catch((error) => {
          console.error(`Failed to remove user ${userId}`, parseError(error));
        });
    },
  }),
};

export default user;
